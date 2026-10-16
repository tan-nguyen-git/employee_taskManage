// Firebase reads shared by several routes.
import { db } from "../firebase.js";
import { OWNER_ID } from "../config.js";

export async function getOwnerForPhone(phoneNumber) {
  const snapshot = await db.ref(`owners/${OWNER_ID}`).get();
  const owner = snapshot.val();
  return owner && owner.role === "owner" && owner.phoneNum === phoneNumber ? owner : null;
}

export async function getEmployee(employeeId) {
  const snapshot = await db.ref(`employees/${employeeId}`).get();
  return snapshot.val();
}

// Returns [employeeId, employee] for the first employee whose `field` equals `value`, or null.
export async function findEmployeeBy(field, value) {
  const snapshot = await db.ref("employees").get();
  const employees = snapshot.val() || {};
  return Object.entries(employees).find(([, employee]) => employee[field] === value) || null;
}

// Strips secrets before an employee record is sent to a client.
export function safeEmployee(employeeId, value) {
  if (!value) return null;
  const { passwordHash, inviteTokenHash, inviteExpiresAt, ...profile } = value;
  return { id: employeeId, ...profile, hasAccount: Boolean(passwordHash) };
}

export async function listTasksForUser(user) {
  const snapshot = await db.ref("tasks").get();
  const tasks = snapshot.val() || {};
  return Object.entries(tasks)
    .filter(([, task]) => user.role === "owner" || task.assignedEmployeeId === user.sub)
    .map(([id, task]) => ({ id, ...task }))
    .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
}
