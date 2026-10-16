export const PORT = Number(process.env.PORT || 3000);
export const OWNER_ID = "owner_001";

export const SESSION_COOKIE = "employee_session";
export const SESSION_SECONDS = 60 * 60;
export const JWT_OPTIONS = { issuer: "employee-task-manager", audience: "employee-task-manager-app" };

export const INVITE_TTL_MS = 24 * 60 * 60 * 1000;
