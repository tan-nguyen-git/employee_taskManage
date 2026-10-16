// One chat thread per employee, between that employee and the owner.
import { Router } from "express";
import { db } from "../firebase.js";
import { validText } from "../lib/validation.js";
import { getEmployee } from "../lib/data.js";
import { canAccessEmployee, requireSession } from "../middleware/auth.js";
import { publishChatMessage } from "../realtime.js";

const router = Router();

router.get("/api/chats/:employeeId/messages", requireSession, async (req, res) => {
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

router.post("/api/chats/:employeeId/messages", requireSession, async (req, res) => {
  const { employeeId } = req.params;
  const body = typeof req.body.message === "string" ? req.body.message.trim() : "";
  if (!canAccessEmployee(req.user, employeeId)) return res.status(403).json({ message: "You cannot send messages in this chat" });
  if (!validText(body, 2000)) return res.status(400).json({ message: "Message must be between 1 and 2000 characters" });
  try {
    const employee = await getEmployee(employeeId);
    if (!employee) return res.status(404).json({ message: "Employee not found" });
    const messageRef = db.ref(`chats/${employeeId}`).push();
    // Sender fields come from the session, never from the request body.
    const message = {
      senderId: req.user.sub,
      senderRole: req.user.role,
      senderName: req.user.role === "owner" ? "Owner" : employee.name,
      text: body,
      createdAt: Date.now()
    };
    await messageRef.set(message);
    const savedMessage = { id: messageRef.key, ...message };
    publishChatMessage(employeeId, savedMessage);
    return res.status(201).json({ success: true, message: savedMessage });
  } catch (error) {
    console.error("Could not send chat message:", error.message);
    return res.status(500).json({ message: "Could not send message" });
  }
});

export default router;
