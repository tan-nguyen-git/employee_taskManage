import crypto from "node:crypto";
import http from "node:http";
import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import { Server as SocketServer } from "socket.io";
import { db } from "./firebase.js";

const app = express();
const httpServer = http.createServer(app);
const io = new SocketServer(httpServer);
const PORT = Number(process.env.PORT || 3000);
const SESSION_COOKIE = "employee_session";
const SESSION_SECONDS = 60 * 60;
const OWNER_ID = "owner_001";
const SMS_LIMIT = rateLimit(4, 15 * 60 * 1000);
const LOGIN_LIMIT = rateLimit(10, 15 * 60 * 1000);
const SETUP_LIMIT = rateLimit(8, 60 * 60 * 1000);

app.use(express.json({ limit: "20kb" }));

function rateLimit(maxRequests, windowMs) {
  const attempts = new Map();
  const cleanup = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, timestamps] of attempts) {
      const recent = timestamps.filter((timestamp) => timestamp > cutoff);
      if (recent.length) attempts.set(key, recent);
      else attempts.delete(key);
    }
  }, windowMs).unref();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const recent = (attempts.get(key) || []).filter((timestamp) => now - timestamp < windowMs);
    if (recent.length >= maxRequests) return res.status(429).json({ message: "Too many attempts. Please wait and try again." });
    recent.push(now);
    attempts.set(key, recent);
    return next();
  };
}

function getJwtSecret() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("Set JWT_SECRET to a random value of at least 32 characters");
  }
  return process.env.JWT_SECRET;
}

function signSession(user) {
  return jwt.sign({ role: user.role }, getJwtSecret(), {
    algorithm: "HS256",
    subject: user.uid,
    issuer: "employee-task-manager",
    audience: "employee-task-manager-app",
    expiresIn: SESSION_SECONDS
  });
}

function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_SECONDS}${secure}`);
}

function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);
}

function readSessionCookie(req) {
  const part = (req.headers.cookie || "").split(";").map((item) => item.trim()).find((item) => item.startsWith(`${SESSION_COOKIE}=`));
  return part ? part.slice(SESSION_COOKIE.length + 1) : null;
}

function requireSession(req, res, next) {
  const token = readSessionCookie(req);
  if (!token) return res.status(401).json({ message: "Please sign in" });
  try {
    req.user = jwt.verify(token, getJwtSecret(), {
      algorithms: ["HS256"],
      issuer: "employee-task-manager",
      audience: "employee-task-manager-app"
    });
    return next();
  } catch {
    return res.status(401).json({ message: "Your session expired. Please sign in again." });
  }
}

function requireOwner(req, res, next) {
  if (req.user?.role !== "owner" || req.user?.sub !== OWNER_ID) {
    return res.status(403).json({ message: "Manager access is required" });
  }
  return next();
}

function requireEmployee(req, res, next) {
  if (req.user?.role !== "employee") return res.status(403).json({ message: "Employee access is required" });
  return next();
}

function validText(value, max = 120) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function safeEmployee(employeeId, value) {
  if (!value) return null;
  const { passwordHash, inviteTokenHash, inviteExpiresAt, ...profile } = value;
  return { id: employeeId, ...profile, hasAccount: Boolean(passwordHash) };
}

async function getOwnerForPhone(phoneNumber) {
  const snapshot = await db.ref(`owners/${OWNER_ID}`).get();
  const owner = snapshot.val();
  return owner && owner.role === "owner" && owner.phoneNum === phoneNumber ? owner : null;
}

function getTwilioConfig() {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) {
    throw new Error("Twilio Verify is not configured");
  }
  return { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID };
}

async function callTwilioVerify(endpoint, fields) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID } = getTwilioConfig();
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");
  const response = await fetch(`https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SERVICE_SID}/${endpoint}`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields)
  });
  const data = await response.json();
  if (!response.ok) {
    console.error("Twilio Verify request failed:", data.message || response.statusText);
    const error = new Error("Verification service request failed");
    error.twilioCode = data.code;
    error.httpStatus = response.status;
    throw error;
  }
  return data;
}

function getMailer() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) return null;
  return {
    from: SMTP_FROM,
    transport: nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT || 587),
      secure: Number(SMTP_PORT || 587) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    })
  };
}

function inviteUrl(employeeId, token) {
  const baseUrl = process.env.APP_BASE_URL || "http://localhost:5173";
  return `${baseUrl.replace(/\/$/, "")}/?setup=${encodeURIComponent(employeeId)}&token=${encodeURIComponent(token)}`;
}

function validSchedule(schedule) {
  if (!schedule || typeof schedule !== "object") return false;
  const { days, start, end } = schedule;
  const validDays = Array.isArray(days) && days.every((day) => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].includes(day));
  const validTime = (time) => typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  return validDays && validTime(start) && validTime(end) && start < end;
}

async function getEmployee(employeeId) {
  const snapshot = await db.ref(`employees/${employeeId}`).get();
  return snapshot.val();
}

async function findEmployeeBy(field, value) {
  const snapshot = await db.ref("employees").get();
  const employees = snapshot.val() || {};
  return Object.entries(employees).find(([, employee]) => employee[field] === value) || null;
}

function canAccessEmployee(user, employeeId) {
  return user.role === "owner" || (user.role === "employee" && user.sub === employeeId);
}

async function listTasksForUser(user) {
  const snapshot = await db.ref("tasks").get();
  const tasks = snapshot.val() || {};
  return Object.entries(tasks)
    .filter(([, task]) => user.role === "owner" || task.assignedEmployeeId === user.sub)
    .map(([id, task]) => ({ id, ...task }))
    .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
}

function publishTasksChanged() {
  io.emit("tasks:changed");
}

app.get("/", (_req, res) => res.json({ message: "Backend connected" }));

app.post("/api/owner/CreateNewAccessCode", SMS_LIMIT, async (req, res) => {
  const phoneNumber = typeof req.body.phoneNumber === "string" ? req.body.phoneNumber.trim() : "";
  if (!/^\+[1-9]\d{7,14}$/.test(phoneNumber)) {
    return res.status(400).json({ message: "Enter a valid phone number in international format, such as +13331234567" });
  }
  try {
    if (!(await getOwnerForPhone(phoneNumber))) return res.status(401).json({ message: "Unable to send a code for this account" });
    await callTwilioVerify("Verifications", { To: phoneNumber, Channel: "sms" });
    return res.json({ message: "A verification code was sent by SMS" });
  } catch (error) {
    console.error("Could not start owner verification:", error.message);
    return res.status(500).json({ message: "Could not send a verification code" });
  }
});

app.post("/api/owner/ValidateAccessCode", LOGIN_LIMIT, async (req, res) => {
  const phoneNumber = typeof req.body.phoneNumber === "string" ? req.body.phoneNumber.trim() : "";
  const accessCode = typeof req.body.accessCode === "string" ? req.body.accessCode.trim() : "";
  if (!/^\+[1-9]\d{7,14}$/.test(phoneNumber) || !/^\d{4,10}$/.test(accessCode)) {
    return res.status(400).json({ message: "Enter a valid phone number and access code" });
  }
  try {
    if (!(await getOwnerForPhone(phoneNumber))) return res.status(401).json({ message: "Unable to verify this account" });
    const result = await callTwilioVerify("VerificationCheck", { To: phoneNumber, Code: accessCode });
    if (result.status !== "approved") {
      return res.status(401).json({ message: "That code was not approved. Use the newest SMS code or request another one." });
    }
    const token = signSession({ uid: OWNER_ID, role: "owner" });
    setSessionCookie(res, token);
    return res.json({ success: true, message: "Phone verified and signed in", user: { uid: OWNER_ID, role: "owner" } });
  } catch (error) {
    console.error("Could not verify owner code:", error.message);
    if ([60202, 60431].includes(Number(error.twilioCode))) {
      return res.status(401).json({ message: "That code expired or can no longer be checked. Request a new code and use the newest SMS." });
    }
    return res.status(500).json({ message: "Could not verify the code" });
  }
});

app.post("/api/auth/employee-login", LOGIN_LIMIT, async (req, res) => {
  const username = typeof req.body.username === "string" ? req.body.username.trim().toLowerCase() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!/^[a-z0-9._-]{3,32}$/.test(username) || password.length < 1 || password.length > 200) {
    return res.status(400).json({ message: "Enter a valid username and password" });
  }
  try {
    const match = await findEmployeeBy("username", username);
    if (!match || !match[1].passwordHash || !(await bcrypt.compare(password, match[1].passwordHash))) {
      return res.status(401).json({ message: "Username or password is incorrect" });
    }
    const [employeeId, employee] = match;
    const token = signSession({ uid: employeeId, role: "employee" });
    setSessionCookie(res, token);
    return res.json({ success: true, user: { uid: employeeId, role: "employee", name: employee.name, email: employee.email, phoneNumber: employee.phoneNumber || "" } });
  } catch (error) {
    console.error("Employee login failed:", error.message);
    return res.status(500).json({ message: "Could not sign in" });
  }
});

app.post("/api/auth/employee-setup", SETUP_LIMIT, async (req, res) => {
  const { employeeId, token } = req.body;
  const username = typeof req.body.username === "string" ? req.body.username.trim().toLowerCase() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!validText(employeeId, 128) || typeof token !== "string" || token.length < 20 ||
      !/^[a-z0-9._-]{3,32}$/.test(username) || password.length < 10 || password.length > 200) {
    return res.status(400).json({ message: "Choose a valid username and a password with at least 10 characters" });
  }
  try {
    const employee = await getEmployee(employeeId);
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    if (!employee || employee.passwordHash || employee.inviteTokenHash !== tokenHash || employee.inviteExpiresAt < Date.now()) {
      return res.status(400).json({ message: "This setup link is invalid, expired, or already used" });
    }
    const existing = await findEmployeeBy("username", username);
    if (existing) return res.status(409).json({ message: "That username is already taken" });
    const passwordHash = await bcrypt.hash(password, 12);
    await db.ref(`employees/${employeeId}`).update({
      username,
      passwordHash,
      accountStatus: "active",
      inviteTokenHash: null,
      inviteExpiresAt: null
    });
    return res.json({ success: true, message: "Account set up. You can now sign in." });
  } catch (error) {
    console.error("Employee setup failed:", error.message);
    return res.status(500).json({ message: "Could not set up the employee account" });
  }
});

app.get("/api/me", requireSession, async (req, res) => {
  if (req.user.role === "owner") return res.json({ user: { uid: OWNER_ID, role: "owner", name: "Owner" } });
  const employee = await getEmployee(req.user.sub);
  if (!employee || employee.accountStatus !== "active") {
    clearSessionCookie(res);
    return res.status(401).json({ message: "Employee account is unavailable" });
  }
  return res.json({ user: { uid: req.user.sub, role: "employee", name: employee.name, email: employee.email, phoneNumber: employee.phoneNumber || "" } });
});

app.post("/api/logout", (_req, res) => {
  clearSessionCookie(res);
  return res.json({ success: true, message: "Signed out" });
});

app.get("/api/employees", requireSession, requireOwner, async (_req, res) => {
  try {
    const snapshot = await db.ref("employees").get();
    const employees = Object.entries(snapshot.val() || {}).map(([id, employee]) => safeEmployee(id, employee));
    return res.json({ employees });
  } catch (error) {
    console.error("Could not list employees:", error.message);
    return res.status(500).json({ message: "Could not load employees" });
  }
});

async function createEmployeeHandler(req, res) {
  const { name, email, department, phoneNumber } = req.body;
  const mailer = getMailer();
  if (!validText(name) || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !validText(department)) {
    return res.status(400).json({ message: "Name, valid email, and department are required" });
  }
  if (phoneNumber !== undefined && phoneNumber !== "" && (typeof phoneNumber !== "string" || !/^\+[1-9]\d{7,14}$/.test(phoneNumber.trim()))) {
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

  const rawToken = crypto.randomBytes(32).toString("hex");
  const employeeRef = db.ref("employees").push();
  const employeeId = employeeRef.key;
  const employee = {
    name: name.trim(), email: email.trim().toLowerCase(), department: department.trim(),
    phoneNumber: phoneNumber ? phoneNumber.trim() : "", role: "employee", accountStatus: "invited",
    schedule: { days: [], start: "09:00", end: "17:00" },
    inviteTokenHash: crypto.createHash("sha256").update(rawToken).digest("hex"),
    inviteExpiresAt: Date.now() + 24 * 60 * 60 * 1000,
    createdAt: Date.now()
  };
  try {
    await employeeRef.set(employee);
    const link = inviteUrl(employeeId, rawToken);
    await mailer.transport.sendMail({
      from: mailer.from,
      to: employee.email,
      subject: "Set up your employee task manager account",
      text: `Hi ${employee.name},\n\nSet up your account using this link (valid for 24 hours):\n${link}\n\nIf you did not expect this invitation, you can ignore this email.`,
      html: `<p>Hi ${escapeHtml(employee.name)},</p><p>Set up your account using this link. It expires in 24 hours.</p><p><a href="${escapeHtml(link)}">Set up your account</a></p><p>If you did not expect this invitation, you can ignore this email.</p>`
    });
    io.emit("employees:changed");
    return res.status(201).json({ success: true, employeeId, message: "Employee added and setup invitation sent" });
  } catch (error) {
    await employeeRef.remove();
    console.error("Could not create or email employee invite:", error.message);
    return res.status(502).json({ message: "Could not create employee or send invitation email" });
  }
}

app.post("/api/employees", requireSession, requireOwner, createEmployeeHandler);
app.post("/api/owner/CreateEmployee", requireSession, requireOwner, createEmployeeHandler);

app.post("/api/owner/GetEmployee", requireSession, requireOwner, async (req, res) => {
  const employeeId = typeof req.body.employeeId === "string" ? req.body.employeeId.trim() : "";
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

app.get("/api/employees/:employeeId", requireSession, async (req, res) => {
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

app.patch("/api/employees/:employeeId", requireSession, async (req, res) => {
  const { employeeId } = req.params;
  const isOwner = req.user.role === "owner" && req.user.sub === OWNER_ID;
  if (!isOwner && !(req.user.role === "employee" && req.user.sub === employeeId)) {
    return res.status(403).json({ message: "You cannot edit this employee" });
  }
  const updates = {};
  for (const field of ["name", "email", "department", "phoneNumber"]) {
    if (req.body[field] === undefined) continue;
    if (!isOwner && field === "department") return res.status(403).json({ message: "Only a manager can change departments" });
    const value = typeof req.body[field] === "string" ? req.body[field].trim() : "";
    const isValid = field === "email"
      ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      : field === "phoneNumber"
        ? value === "" || /^\+[1-9]\d{7,14}$/.test(value)
        : validText(value, field === "department" ? 100 : 120);
    if (!isValid) {
      return res.status(400).json({ message: `Enter a valid ${field}` });
    }
    updates[field] = field === "email" ? value.toLowerCase() : value;
  }
  if (req.body.schedule !== undefined) {
    if (!isOwner) return res.status(403).json({ message: "Only a manager can change schedules" });
    if (!validSchedule(req.body.schedule)) return res.status(400).json({ message: "Choose valid work days and start/end times" });
    updates.schedule = req.body.schedule;
  }
  if (Object.keys(updates).length === 0) return res.status(400).json({ message: "No valid changes provided" });
  try {
    const ref = db.ref(`employees/${employeeId}`);
    if (!(await ref.get()).exists()) return res.status(404).json({ message: "Employee not found" });
    await ref.update(updates);
    io.emit("employees:changed");
    return res.json({ success: true, employee: safeEmployee(employeeId, { ...(await getEmployee(employeeId)) }) });
  } catch (error) {
    console.error("Could not update employee:", error.message);
    return res.status(500).json({ message: "Could not update employee" });
  }
});

async function deleteEmployeeHandler(employeeId, res) {
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
    io.emit("employees:changed");
    publishTasksChanged();
    io.to(`chat:${employeeId}`).emit("chat:closed");
    return res.json({ success: true });
  } catch (error) {
    console.error("Could not delete employee:", error.message);
    return res.status(500).json({ message: "Could not delete employee" });
  }
}

app.delete("/api/employees/:employeeId", requireSession, requireOwner, (req, res) => deleteEmployeeHandler(req.params.employeeId, res));
app.post("/api/owner/DeleteEmployee", requireSession, requireOwner, (req, res) => {
  const employeeId = typeof req.body.employeeId === "string" ? req.body.employeeId.trim() : "";
  if (!validText(employeeId, 128)) return res.status(400).json({ message: "Employee ID is required" });
  return deleteEmployeeHandler(employeeId, res);
});

app.get("/api/tasks", requireSession, async (req, res) => {
  try {
    return res.json({ tasks: await listTasksForUser(req.user) });
  } catch (error) {
    console.error("Could not list tasks:", error.message);
    return res.status(500).json({ message: "Could not load tasks" });
  }
});

app.post("/api/tasks", requireSession, requireOwner, async (req, res) => {
  const { title, description = "", assignedEmployeeId = "", dueDate = "", priority = "normal" } = req.body;
  if (!validText(title, 140) || (typeof description !== "string" || description.length > 2000) || !["low", "normal", "high"].includes(priority)) {
    return res.status(400).json({ message: "Enter a title, valid description, and priority" });
  }
  try {
    let assigneeName = "Unassigned";
    if (assignedEmployeeId) {
      const employee = await getEmployee(assignedEmployeeId);
      if (!employee) return res.status(400).json({ message: "Choose an existing employee" });
      assigneeName = employee.name;
    }
    const taskRef = db.ref("tasks").push();
    const task = {
      title: title.trim(), description: description.trim(), assignedEmployeeId: assignedEmployeeId || null,
      assigneeName, dueDate: typeof dueDate === "string" ? dueDate : "", priority,
      status: "assigned", createdAt: Date.now(), updatedAt: Date.now(), createdBy: OWNER_ID
    };
    await taskRef.set(task);
    publishTasksChanged();
    return res.status(201).json({ success: true, task: { id: taskRef.key, ...task } });
  } catch (error) {
    console.error("Could not create task:", error.message);
    return res.status(500).json({ message: "Could not create task" });
  }
});

app.patch("/api/tasks/:taskId", requireSession, async (req, res) => {
  const taskRef = db.ref(`tasks/${req.params.taskId}`);
  try {
    const snapshot = await taskRef.get();
    const task = snapshot.val();
    if (!task) return res.status(404).json({ message: "Task not found" });
    const isOwner = req.user.role === "owner" && req.user.sub === OWNER_ID;
    const isAssignee = req.user.role === "employee" && task.assignedEmployeeId === req.user.sub;
    if (!isOwner && !isAssignee) return res.status(403).json({ message: "You cannot update this task" });
    const updates = {};
    if (isAssignee) {
      if (req.body.status !== "done") return res.status(403).json({ message: "Employees can only mark their assigned tasks as done" });
      updates.status = "done";
    } else {
      for (const field of ["title", "description", "dueDate"]) {
        if (req.body[field] === undefined) continue;
        if (typeof req.body[field] !== "string" || (field === "title" && !validText(req.body[field], 140)) || req.body[field].length > (field === "description" ? 2000 : 140)) {
          return res.status(400).json({ message: `Enter a valid ${field}` });
        }
        updates[field] = req.body[field].trim();
      }
      if (req.body.status !== undefined) {
        if (!["assigned", "in-progress", "done"].includes(req.body.status)) return res.status(400).json({ message: "Invalid task status" });
        updates.status = req.body.status;
      }
      if (req.body.priority !== undefined) {
        if (!["low", "normal", "high"].includes(req.body.priority)) return res.status(400).json({ message: "Invalid priority" });
        updates.priority = req.body.priority;
      }
      if (req.body.assignedEmployeeId !== undefined) {
        const id = req.body.assignedEmployeeId;
        if (id) {
          const employee = await getEmployee(id);
          if (!employee) return res.status(400).json({ message: "Choose an existing employee" });
          updates.assignedEmployeeId = id;
          updates.assigneeName = employee.name;
        } else {
          updates.assignedEmployeeId = null;
          updates.assigneeName = "Unassigned";
        }
      }
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ message: "No valid changes provided" });
    updates.updatedAt = Date.now();
    await taskRef.update(updates);
    publishTasksChanged();
    return res.json({ success: true, task: { id: req.params.taskId, ...(await taskRef.get()).val() } });
  } catch (error) {
    console.error("Could not update task:", error.message);
    return res.status(500).json({ message: "Could not update task" });
  }
});

app.delete("/api/tasks/:taskId", requireSession, requireOwner, async (req, res) => {
  try {
    const taskRef = db.ref(`tasks/${req.params.taskId}`);
    if (!(await taskRef.get()).exists()) return res.status(404).json({ message: "Task not found" });
    await taskRef.remove();
    publishTasksChanged();
    return res.json({ success: true });
  } catch (error) {
    console.error("Could not delete task:", error.message);
    return res.status(500).json({ message: "Could not delete task" });
  }
});

app.get("/api/chats/:employeeId/messages", requireSession, async (req, res) => {
  const { employeeId } = req.params;
  if (!canAccessEmployee(req.user, employeeId)) return res.status(403).json({ message: "You cannot view this chat" });
  try {
    if (!(await getEmployee(employeeId))) return res.status(404).json({ message: "Employee not found" });
    const snapshot = await db.ref(`chats/${employeeId}`).get();
    const messages = Object.entries(snapshot.val() || {}).map(([id, message]) => ({ id, ...message })).sort((a, b) => a.createdAt - b.createdAt);
    return res.json({ messages });
  } catch (error) {
    console.error("Could not load chat:", error.message);
    return res.status(500).json({ message: "Could not load chat" });
  }
});

app.post("/api/chats/:employeeId/messages", requireSession, async (req, res) => {
  const { employeeId } = req.params;
  const body = typeof req.body.message === "string" ? req.body.message.trim() : "";
  if (!canAccessEmployee(req.user, employeeId)) return res.status(403).json({ message: "You cannot send messages in this chat" });
  if (!validText(body, 2000)) return res.status(400).json({ message: "Message must be between 1 and 2000 characters" });
  try {
    const employee = await getEmployee(employeeId);
    if (!employee) return res.status(404).json({ message: "Employee not found" });
    const messageRef = db.ref(`chats/${employeeId}`).push();
    const message = {
      senderId: req.user.sub,
      senderRole: req.user.role,
      senderName: req.user.role === "owner" ? "Owner" : employee.name,
      text: body,
      createdAt: Date.now()
    };
    await messageRef.set(message);
    const savedMessage = { id: messageRef.key, ...message };
    io.to(`chat:${employeeId}`).emit("chat:message", savedMessage);
    return res.status(201).json({ success: true, message: savedMessage });
  } catch (error) {
    console.error("Could not send chat message:", error.message);
    return res.status(500).json({ message: "Could not send message" });
  }
});

io.use((socket, next) => {
  try {
    const cookiePart = (socket.handshake.headers.cookie || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`));
    if (!cookiePart) return next(new Error("Authentication required"));
    socket.data.user = jwt.verify(cookiePart.slice(SESSION_COOKIE.length + 1), getJwtSecret(), {
      algorithms: ["HS256"], issuer: "employee-task-manager", audience: "employee-task-manager-app"
    });
    return next();
  } catch {
    return next(new Error("Invalid session"));
  }
});

io.on("connection", (socket) => {
    const user = socket.data.user;
    socket.join("authenticated");
    const remainingSessionMs = Math.max(0, user.exp * 1000 - Date.now());
    const sessionTimer = setTimeout(() => socket.disconnect(true), remainingSessionMs);
    sessionTimer.unref();
    socket.on("disconnect", () => clearTimeout(sessionTimer));
    if (user.role === "employee") socket.join(`chat:${user.sub}`);
    socket.on("chat:join", async (employeeId) => {
    if (typeof employeeId !== "string" || !canAccessEmployee(user, employeeId)) return;
    if (!(await getEmployee(employeeId))) return;
    socket.join(`chat:${employeeId}`);
    });
});

httpServer.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
