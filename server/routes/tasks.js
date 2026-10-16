// Tasks: the owner creates, edits and deletes; the assigned employee can only mark a task done.
import { Router } from "express";
import { db } from "../firebase.js";
import { OWNER_ID } from "../config.js";
import { validText } from "../lib/validation.js";
import { getEmployee, listTasksForUser } from "../lib/data.js";
import { isOwner, requireOwner, requireSession } from "../middleware/auth.js";
import { publishTasksChanged } from "../realtime.js";

const STATUSES = ["assigned", "in-progress", "done"];
const PRIORITIES = ["low", "normal", "high"];

const router = Router();

// Owner gets every task; an employee gets only tasks assigned to them.
router.get("/api/tasks", requireSession, async (req, res) => {
  try {
    return res.json({ tasks: await listTasksForUser(req.user) });
  } catch (error) {
    console.error("Could not list tasks:", error.message);
    return res.status(500).json({ message: "Could not load tasks" });
  }
});

router.post("/api/tasks", requireSession, requireOwner, async (req, res) => {
  const { title, description = "", assignedEmployeeId = "", dueDate = "", priority = "normal" } = req.body;
  if (!validText(title, 140) || (typeof description !== "string" || description.length > 2000) || !PRIORITIES.includes(priority)) {
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

// Builds the owner's update object, or returns { error } for a 400 response.
async function ownerTaskUpdates(body) {
  const updates = {};
  for (const field of ["title", "description", "dueDate"]) {
    if (body[field] === undefined) continue;
    if (typeof body[field] !== "string" || (field === "title" && !validText(body[field], 140)) || body[field].length > (field === "description" ? 2000 : 140)) {
      return { error: `Enter a valid ${field}` };
    }
    updates[field] = body[field].trim();
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return { error: "Invalid task status" };
    updates.status = body.status;
  }
  if (body.priority !== undefined) {
    if (!PRIORITIES.includes(body.priority)) return { error: "Invalid priority" };
    updates.priority = body.priority;
  }
  if (body.assignedEmployeeId !== undefined) {
    const id = body.assignedEmployeeId;
    if (id) {
      const employee = await getEmployee(id);
      if (!employee) return { error: "Choose an existing employee" };
      updates.assignedEmployeeId = id;
      updates.assigneeName = employee.name;
    } else {
      updates.assignedEmployeeId = null;
      updates.assigneeName = "Unassigned";
    }
  }
  return { updates };
}

router.patch("/api/tasks/:taskId", requireSession, async (req, res) => {
  const taskRef = db.ref(`tasks/${req.params.taskId}`);
  try {
    const snapshot = await taskRef.get();
    const task = snapshot.val();
    if (!task) return res.status(404).json({ message: "Task not found" });
    const owner = isOwner(req.user);
    const isAssignee = req.user.role === "employee" && task.assignedEmployeeId === req.user.sub;
    if (!owner && !isAssignee) return res.status(403).json({ message: "You cannot update this task" });

    let updates;
    if (isAssignee) {
      if (req.body.status !== "done") return res.status(403).json({ message: "Employees can only mark their assigned tasks as done" });
      updates = { status: "done" };
    } else {
      const result = await ownerTaskUpdates(req.body);
      if (result.error) return res.status(400).json({ message: result.error });
      updates = result.updates;
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

router.delete("/api/tasks/:taskId", requireSession, requireOwner, async (req, res) => {
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

export default router;
