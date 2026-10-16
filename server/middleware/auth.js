import { OWNER_ID } from "../config.js";
import { readSessionToken, verifySession } from "../lib/session.js";

// Sets req.user to the JWT payload ({ sub, role }) or responds 401.
export function requireSession(req, res, next) {
  const token = readSessionToken(req.headers.cookie);
  if (!token) return res.status(401).json({ message: "Please sign in" });
  try {
    req.user = verifySession(token);
    return next();
  } catch {
    return res.status(401).json({ message: "Your session expired. Please sign in again." });
  }
}

export function isOwner(user) {
  return user?.role === "owner" && user?.sub === OWNER_ID;
}

export function requireOwner(req, res, next) {
  if (!isOwner(req.user)) return res.status(403).json({ message: "Manager access is required" });
  return next();
}

export function requireEmployee(req, res, next) {
  if (req.user?.role !== "employee") return res.status(403).json({ message: "Employee access is required" });
  return next();
}

// The owner can access any employee; an employee can only access themselves.
export function canAccessEmployee(user, employeeId) {
  return user.role === "owner" || (user.role === "employee" && user.sub === employeeId);
}
