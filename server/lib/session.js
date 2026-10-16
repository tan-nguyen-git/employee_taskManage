// JWT session stored in an HttpOnly cookie. Used by both Express and Socket.IO.
import jwt from "jsonwebtoken";
import { JWT_OPTIONS, SESSION_COOKIE, SESSION_SECONDS } from "../config.js";

function getJwtSecret() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("Set JWT_SECRET to a random value of at least 32 characters");
  }
  return process.env.JWT_SECRET;
}

export function signSession(user) {
  return jwt.sign({ role: user.role }, getJwtSecret(), {
    algorithm: "HS256",
    subject: user.uid,
    ...JWT_OPTIONS,
    expiresIn: SESSION_SECONDS
  });
}

// Throws if the token is invalid or expired. Returns the payload ({ sub, role, exp, ... }).
export function verifySession(token) {
  return jwt.verify(token, getJwtSecret(), { algorithms: ["HS256"], ...JWT_OPTIONS });
}

function cookieAttributes(maxAge) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

export function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${token}; ${cookieAttributes(SESSION_SECONDS)}`);
}

export function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; ${cookieAttributes(0)}`);
}

// Reads the session token from a raw Cookie header, or returns null.
export function readSessionToken(cookieHeader = "") {
  const part = cookieHeader.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${SESSION_COOKIE}=`));
  return part ? part.slice(SESSION_COOKIE.length + 1) : null;
}
