// Local emulator: runs the real server (index.js) with no outside services.
//   - Firebase Realtime Database -> in-memory store seeded with demo data
//   - Twilio Verify SMS         -> access codes are printed to this terminal
//   - SMTP invitation email     -> emails (with the setup link) are printed to this terminal
// Nothing is read from .env or service-account.json, and data resets on every restart.
//
// Usage:  npm run emulator   (then `npm run dev` in ../client and open http://localhost:5173)
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";

const OWNER_PHONE = process.env.EMULATOR_OWNER_PHONE || "+15555550100";
const EMPLOYEE_PASSWORD = "password1234";
const BOB_INVITE_TOKEN = "emulator-invite-token-for-bob-0001";

function log(message) {
  console.log(`\x1b[36m[emulator]\x1b[0m ${message}`);
}

// ---------- Fake environment (never touches the real .env) ----------
process.env.JWT_SECRET ??= crypto.randomBytes(32).toString("hex");
process.env.TWILIO_ACCOUNT_SID ??= "AC_emulator";
process.env.TWILIO_AUTH_TOKEN ??= "emulator";
process.env.TWILIO_VERIFY_SERVICE_SID ??= "VA_emulator";
process.env.SMTP_HOST ??= "smtp.emulator.local";
process.env.SMTP_USER ??= "emulator";
process.env.SMTP_PASS ??= "emulator";
process.env.SMTP_FROM ??= "Employee Task Manager <no-reply@emulator.local>";
process.env.APP_BASE_URL ??= "http://localhost:5173";

// ---------- In-memory Firebase Realtime Database ----------
// Implements the subset of the firebase-admin API that index.js uses:
// db.ref(path).get()/set()/update()/remove()/push(), snapshot.val()/exists().
function pushId() {
  return `-${Date.now().toString(36).padStart(9, "0")}${crypto.randomBytes(6).toString("hex")}`;
}

function createMemoryDb(initialData) {
  let root = structuredClone(initialData);
  const split = (path) => (path || "").split("/").filter(Boolean);

  function read(parts) {
    let node = root;
    for (const key of parts) {
      if (node === null || typeof node !== "object" || !(key in node)) return null;
      node = node[key];
    }
    return node;
  }

  function write(parts, value) {
    if (!parts.length) {
      root = value == null ? {} : structuredClone(value);
      return;
    }
    let node = root;
    for (const key of parts.slice(0, -1)) {
      if (node[key] === null || typeof node[key] !== "object") node[key] = {};
      node = node[key];
    }
    const last = parts.at(-1);
    if (value == null) delete node[last];
    else node[last] = structuredClone(value);
  }

  function ref(path = "") {
    const parts = split(path);
    return {
      key: parts.at(-1) ?? null,
      async get() {
        const value = structuredClone(read(parts));
        return { val: () => value, exists: () => value !== null };
      },
      async set(value) { write(parts, value); },
      // Like Firebase: keys may be deep paths ("tasks/abc/status") and null deletes.
      async update(changes) {
        for (const [childPath, value] of Object.entries(changes)) write([...parts, ...split(childPath)], value);
      },
      async remove() { write(parts, null); },
      push() { return ref([...parts, pushId()].join("/")); }
    };
  }

  return { ref, app: { delete: async () => {} } };
}

// ---------- Seed data ----------
const now = Date.now();
const today = new Date();
const inDays = (days) => new Date(today.getTime() + days * 86400000).toISOString().slice(0, 10);

const seed = {
  owners: {
    owner_001: { role: "owner", phoneNum: OWNER_PHONE }
  },
  employees: {
    emp_alice: {
      name: "Alice Nguyen", email: "alice@example.com", department: "Engineering",
      phoneNumber: "+15555550101", role: "employee", accountStatus: "active",
      username: "alice", passwordHash: await bcrypt.hash(EMPLOYEE_PASSWORD, 10),
      schedule: { days: ["Mon", "Tue", "Wed", "Thu", "Fri"], start: "09:00", end: "17:00" },
      createdAt: now
    },
    emp_bob: {
      name: "Bob Tran", email: "bob@example.com", department: "Sales",
      phoneNumber: "", role: "employee", accountStatus: "invited",
      schedule: { days: ["Mon", "Wed", "Fri"], start: "10:00", end: "16:00" },
      inviteTokenHash: crypto.createHash("sha256").update(BOB_INVITE_TOKEN).digest("hex"),
      inviteExpiresAt: now + 24 * 60 * 60 * 1000,
      createdAt: now
    }
  },
  tasks: {
    task_1: {
      title: "Prepare weekly report", description: "Summarise this week's progress for the team meeting.",
      assignedEmployeeId: "emp_alice", assigneeName: "Alice Nguyen", dueDate: inDays(2), priority: "high",
      status: "in-progress", createdAt: now, updatedAt: now, createdBy: "owner_001"
    },
    task_2: {
      title: "Fix login page typo", description: "",
      assignedEmployeeId: "emp_alice", assigneeName: "Alice Nguyen", dueDate: inDays(5), priority: "low",
      status: "assigned", createdAt: now, updatedAt: now, createdBy: "owner_001"
    },
    task_3: {
      title: "Call new leads", description: "Follow up with last week's sign-ups.",
      assignedEmployeeId: "emp_bob", assigneeName: "Bob Tran", dueDate: inDays(1), priority: "normal",
      status: "assigned", createdAt: now, updatedAt: now, createdBy: "owner_001"
    }
  },
  chats: {
    emp_alice: {
      msg_1: { senderId: "owner_001", senderRole: "owner", senderName: "Owner", text: "Hi Alice, welcome to the emulator!", createdAt: now }
    }
  }
};

globalThis.__EMULATOR_DB__ = createMemoryDb(seed);

// ---------- Fake Twilio Verify ----------
const pendingCodes = new Map();
const realFetch = globalThis.fetch;

globalThis.fetch = async (url, options = {}) => {
  const match = String(url).match(/^https:\/\/verify\.twilio\.com\/v2\/Services\/[^/]+\/(Verifications|VerificationCheck)$/);
  if (!match) return realFetch(url, options);
  const fields = Object.fromEntries(new URLSearchParams(options.body));

  if (match[1] === "Verifications") {
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    pendingCodes.set(fields.To, code);
    log(`SMS to ${fields.To}: your access code is \x1b[1m${code}\x1b[0m`);
    return Response.json({ status: "pending", to: fields.To });
  }

  if (!pendingCodes.has(fields.To)) {
    return Response.json({ code: 20404, message: "No pending verification" }, { status: 404 });
  }
  const approved = pendingCodes.get(fields.To) === fields.Code;
  if (approved) pendingCodes.delete(fields.To);
  return Response.json({ status: approved ? "approved" : "pending", to: fields.To });
};

// ---------- Fake SMTP ----------
nodemailer.createTransport = () => ({
  async sendMail({ to, subject, text }) {
    log(`Email to ${to}\n  Subject: ${subject}\n  ${text.replace(/\n/g, "\n  ")}`);
    return { messageId: `emulated-${crypto.randomUUID()}` };
  }
});

// ---------- Start the real server ----------
log("Running with in-memory data (resets on restart)");
log(`Manager login:  phone ${OWNER_PHONE}  (the SMS code will be printed here)`);
log(`Employee login: alice / ${EMPLOYEE_PASSWORD}`);
log(`Invite link for Bob: ${process.env.APP_BASE_URL}/?setup=emp_bob&token=${BOB_INVITE_TOKEN}`);
await import("./index.js");
