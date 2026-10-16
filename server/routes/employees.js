// Employee directory: the owner invites, edits and removes employees; employees can edit their own contact details.
import crypto from "node:crypto";
import { Router } from "express";
import { db } from "../firebase.js";
import { INVITE_TTL_MS } from "../config.js";
import { getMailer, sendInviteEmail } from "../lib/mailer.js";
import { EMAIL_PATTERN, PHONE_PATTERN, trimmedString, validSchedule, validText } from "../lib/validation.js";
import { findEmployeeBy, getEmployee, safeEmployee } from "../lib/data.js";
import { canAccessEmployee, isOwner, requireOwner, requireSession } from "../middleware/auth.js";
import { publishChatClosed, publishEmployeesChanged, publishTasksChanged } from "../realtime.js";

const router = Router();

router.get("/api/employees", requireSession, requireOwner, async (_req, res) => {
  try {
    const snapshot = await db.ref("employees").get();
    const employees = Object.entries(snapshot.val() || {}).map(([id, employee]) => safeEmployee(id, employee));
    return res.json({ employees });
  } catch (error) {
    console.error("Could not list employees:", error.message);
    return res.status(500).json({ message: "Could not load employees" });
  }
});

// Creates an "invited" employee and emails them a one-time setup link.
async function createEmployee(req, res) {
  const { name, email, department, phoneNumber } = req.body;
  const mailer = getMailer();
  if (!validText(name) || typeof email !== "string" || !EMAIL_PATTERN.test(email.trim()) || !validText(department)) {
    return res.status(400).json({ message: "Name, valid email, and department are required" });
  }
  if (phoneNumber !== undefined && phoneNumber !== "" && (typeof phoneNumber !== "string" || !PHONE_PATTERN.test(phoneNumber.trim()))) {
    return res.status(400).json({ message: "Employee phone numbers must use international format" });
  }
  if (!mailer) return res.status(503).json({ message: "Employee invitation email is not configured. Add SMTP settings to the server environment." });

  try {
    const duplicateEmail = await findEmployeeBy("email", email.trim().toLowerCase());
    if (duplicateEmail) return res.status(409).json({ message: "An employee with that email already exists" });
  } catch (error) {
    console.error("Could not check employee email:", error.message);
    return res.status(500).json({ message: "Could not check employee details" });
  }

  // Only the hash is stored; the raw token exists only in the email link.
  const rawToken = crypto.randomBytes(32).toString("hex");
  const employeeRef = db.ref("employees").push();
  const employeeId = employeeRef.key;
  const employee = {
    name: name.trim(), email: email.trim().toLowerCase(), department: department.trim(),
    phoneNumber: phoneNumber ? phoneNumber.trim() : "", role: "employee", accountStatus: "invited",
    schedule: { days: [], start: "09:00", end: "17:00" },
    inviteTokenHash: crypto.createHash("sha256").update(rawToken).digest("hex"),
    inviteExpiresAt: Date.now() + INVITE_TTL_MS,
    createdAt: Date.now()
  };
  try {
    await employeeRef.set(employee);
    await sendInviteEmail(mailer, employeeId, employee, rawToken);
    publishEmployeesChanged();
    return res.status(201).json({ success: true, employeeId, message: "Employee added and setup invitation sent" });
  } catch (error) {
    await employeeRef.remove(); // don't keep an employee whose invite never arrived
    console.error("Could not create or email employee invite:", error.message);
    return res.status(502).json({ message: "Could not create employee or send invitation email" });
  }
}

router.post("/api/employees", requireSession, requireOwner, createEmployee);
router.post("/api/owner/CreateEmployee", requireSession, requireOwner, createEmployee);

router.post("/api/owner/GetEmployee", requireSession, requireOwner, async (req, res) => {
  const employeeId = trimmedString(req.body.employeeId);
  if (!validText(employeeId, 128)) return res.status(400).json({ message: "Employee ID is required" });
  try {
    const employee = await getEmployee(employeeId);
    if (!employee) return res.status(404).json({ message: "Employee not found" });
    return res.json(safeEmployee(employeeId, employee));
  } catch (error) {
    console.error("Could not get employee:", error.message);
    return res.status(500).json({ message: "Could not load employee" });
  }
});

router.get("/api/employees/:employeeId", requireSession, async (req, res) => {
  if (!canAccessEmployee(req.user, req.params.employeeId)) return res.status(403).json({ message: "You cannot view this employee" });
  try {
    const employee = await getEmployee(req.params.employeeId);
    if (!employee) return res.status(404).json({ message: "Employee not found" });
    return res.json({ employee: safeEmployee(req.params.employeeId, employee) });
  } catch (error) {
    console.error("Could not get employee:", error.message);
    return res.status(500).json({ message: "Could not load employee" });
  }
});

// Owner: any field incl. department and schedule. Employee: own name, email, phone only.
router.patch("/api/employees/:employeeId", requireSession, async (req, res) => {
  const { employeeId } = req.params;
  const owner = isOwner(req.user);
  if (!owner && !(req.user.role === "employee" && req.user.sub === employeeId)) {
    return res.status(403).json({ message: "You cannot edit this employee" });
  }
  const updates = {};
  for (const field of ["name", "email", "department", "phoneNumber"]) {
    if (req.body[field] === undefined) continue;
    if (!owner && field === "department") return res.status(403).json({ message: "Only a manager can change departments" });
    const value = trimmedString(req.body[field]);
    const isValid = field === "email"
      ? EMAIL_PATTERN.test(value)
      : field === "phoneNumber"
        ? value === "" || PHONE_PATTERN.test(value)
        : validText(value, field === "department" ? 100 : 120);
    if (!isValid) {
      return res.status(400).json({ message: `Enter a valid ${field}` });
    }
    updates[field] = field === "email" ? value.toLowerCase() : value;
  }
  if (req.body.schedule !== undefined) {
    if (!owner) return res.status(403).json({ message: "Only a manager can change schedules" });
    if (!validSchedule(req.body.schedule)) return res.status(400).json({ message: "Choose valid work days and start/end times" });
    updates.schedule = req.body.schedule;
  }
  if (Object.keys(updates).length === 0) return res.status(400).json({ message: "No valid changes provided" });
  try {
    const ref = db.ref(`employees/${employeeId}`);
    if (!(await ref.get()).exists()) return res.status(404).json({ message: "Employee not found" });
    await ref.update(updates);
    publishEmployeesChanged();
    return res.json({ success: true, employee: safeEmployee(employeeId, { ...(await getEmployee(employeeId)) }) });
  } catch (error) {
    console.error("Could not update employee:", error.message);
    return res.status(500).json({ message: "Could not update employee" });
  }
});

// Deletes the employee and their chat, and unassigns their tasks, in one atomic update.
async function deleteEmployee(employeeId, res) {
  try {
    const employee = await getEmployee(employeeId);
    if (!employee) return res.status(404).json({ message: "Employee not found" });
    const taskSnapshot = await db.ref("tasks").get();
    const changes = { [`employees/${employeeId}`]: null, [`chats/${employeeId}`]: null };
    for (const [taskId, task] of Object.entries(taskSnapshot.val() || {})) {
      if (task.assignedEmployeeId === employeeId) {
        changes[`tasks/${taskId}/assignedEmployeeId`] = null;
        changes[`tasks/${taskId}/assigneeName`] = "Unassigned";
      }
    }
    await db.ref().update(changes);
    publishEmployeesChanged();
    publishTasksChanged();
    publishChatClosed(employeeId);
    return res.json({ success: true });
  } catch (error) {
    console.error("Could not delete employee:", error.message);
    return res.status(500).json({ message: "Could not delete employee" });
  }
}

router.delete("/api/employees/:employeeId", requireSession, requireOwner, (req, res) => deleteEmployee(req.params.employeeId, res));
router.post("/api/owner/DeleteEmployee", requireSession, requireOwner, (req, res) => {
  const employeeId = trimmedString(req.body.employeeId);
  if (!validText(employeeId, 128)) return res.status(400).json({ message: "Employee ID is required" });
  return deleteEmployee(employeeId, res);
});

export default router;
