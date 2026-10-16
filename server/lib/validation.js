export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validText(value, max = 120) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
}

// Returns the trimmed string, or "" when the value isn't a string.
export function trimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function validSchedule(schedule) {
  if (!schedule || typeof schedule !== "object") return false;
  const { days, start, end } = schedule;
  const validDays = Array.isArray(days) && days.every((day) => WEEKDAYS.includes(day));
  const validTime = (time) => typeof time === "string" && TIME_PATTERN.test(time);
  return validDays && validTime(start) && validTime(end) && start < end;
}

export function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}
