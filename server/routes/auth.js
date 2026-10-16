// Sign-in for the owner (SMS code) and employees (username + password), invite setup, and session.
import crypto from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../firebase.js";
import { OWNER_ID } from "../config.js";
import { LOGIN_LIMIT, SETUP_LIMIT, SMS_LIMIT } from "../lib/rateLimit.js";
import { clearSessionCookie, setSessionCookie, signSession } from "../lib/session.js";
import { checkVerificationCode, sendVerificationCode } from "../lib/twilio.js";
import { PHONE_PATTERN, USERNAME_PATTERN, trimmedString, validText } from "../lib/validation.js";
import { findEmployeeBy, getEmployee, getOwnerForPhone } from "../lib/data.js";
import { requireSession } from "../middleware/auth.js";

const router = Router();

// Owner login, step 1: text a one-time code to the owner's phone.
router.post("/api/owner/CreateNewAccessCode", SMS_LIMIT, async (req, res) => {
  const phoneNumber = trimmedString(req.body.phoneNumber);
  if (!PHONE_PATTERN.test(phoneNumber)) {
    return res.status(400).json({ message: "Enter a valid phone number in international format, such as +13331234567" });
  }
  try {
    if (!(await getOwnerForPhone(phoneNumber))) return res.status(401).json({ message: "Unable to send a code for this account" });
    await sendVerificationCode(phoneNumber);
    return res.json({ message: "A verification code was sent by SMS" });
  } catch (error) {
    console.error("Could not start owner verification:", error.message);
    return res.status(500).json({ message: "Could not send a verification code" });
  }
});

// Owner login, step 2: check the code and start a session.
router.post("/api/owner/ValidateAccessCode", LOGIN_LIMIT, async (req, res) => {
  const phoneNumber = trimmedString(req.body.phoneNumber);
  const accessCode = trimmedString(req.body.accessCode);
  if (!PHONE_PATTERN.test(phoneNumber) || !/^\d{4,10}$/.test(accessCode)) {
    return res.status(400).json({ message: "Enter a valid phone number and access code" });
  }
  try {
    if (!(await getOwnerForPhone(phoneNumber))) return res.status(401).json({ message: "Unable to verify this account" });
    const result = await checkVerificationCode(phoneNumber, accessCode);
    if (result.status !== "approved") {
      return res.status(401).json({ message: "That code was not approved. Use the newest SMS code or request another one." });
    }
    //set cookie
    setSessionCookie(res, signSession({ uid: OWNER_ID, role: "owner" }));
    return res.json({ success: true, message: "Phone verified and signed in", user: { uid: OWNER_ID, role: "owner" } });
  } catch (error) {
    console.error("Could not verify owner code:", error.message);
    if ([60202, 60431].includes(Number(error.twilioCode))) {
      return res.status(401).json({ message: "That code expired or can no longer be checked. Request a new code and use the newest SMS." });
    }
    return res.status(500).json({ message: "Could not verify the code" });
  }
});

router.post("/api/auth/employee-login", LOGIN_LIMIT, async (req, res) => {
  const username = trimmedString(req.body.username).toLowerCase();
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!USERNAME_PATTERN.test(username) || password.length < 1 || password.length > 200) {
    return res.status(400).json({ message: "Enter a valid username and password" });
  }
  try {
    const match = await findEmployeeBy("username", username);
    if (!match || !match[1].passwordHash || !(await bcrypt.compare(password, match[1].passwordHash))) {
      return res.status(401).json({ message: "Username or password is incorrect" });
    }
    const [employeeId, employee] = match;
    setSessionCookie(res, signSession({ uid: employeeId, role: "employee" }));
    return res.json({ success: true, user: { uid: employeeId, role: "employee", name: employee.name, email: employee.email, phoneNumber: employee.phoneNumber || "" } });
  } catch (error) {
    console.error("Employee login failed:", error.message);
    return res.status(500).json({ message: "Could not sign in" });
  }
});

// Invited employee chooses a username and password using the one-time link from their email.
router.post("/api/auth/employee-setup", SETUP_LIMIT, async (req, res) => {
  const { employeeId, token } = req.body;
  const username = trimmedString(req.body.username).toLowerCase();
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!validText(employeeId, 128) || typeof token !== "string" || token.length < 20 ||
      !USERNAME_PATTERN.test(username) || password.length < 10 || password.length > 200) {
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

// Who is signed in? Called by the client on every page load.
router.get("/api/me", requireSession, async (req, res) => {
  if (req.user.role === "owner") return res.json({ user: { uid: OWNER_ID, role: "owner", name: "Owner" } });
  const employee = await getEmployee(req.user.sub);
  if (!employee || employee.accountStatus !== "active") {
    clearSessionCookie(res);
    return res.status(401).json({ message: "Employee account is unavailable" });
  }
  return res.json({ user: { uid: req.user.sub, role: "employee", name: employee.name, email: employee.email, phoneNumber: employee.phoneNumber || "" } });
});

router.post("/api/logout", (_req, res) => {
  clearSessionCookie(res);
  return res.json({ success: true, message: "Signed out" });
});

export default router;
