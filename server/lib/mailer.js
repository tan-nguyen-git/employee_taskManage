// SMTP email for employee invitations.
import nodemailer from "nodemailer";
import { escapeHtml } from "./validation.js";

// Returns null when SMTP isn't configured.
export function getMailer() {
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

export function sendInviteEmail(mailer, employeeId, employee, rawToken) {
  const link = inviteUrl(employeeId, rawToken);
  return mailer.transport.sendMail({
    from: mailer.from,
    to: employee.email,
    subject: "Set up your employee task manager account",
    text: `Hi ${employee.name},\n\nSet up your account using this link (valid for 24 hours):\n${link}\n\nIf you did not expect this invitation, you can ignore this email.`,
    html: `<p>Hi ${escapeHtml(employee.name)},</p><p>Set up your account using this link. It expires in 24 hours.</p><p><a href="${escapeHtml(link)}">Set up your account</a></p><p>If you did not expect this invitation, you can ignore this email.</p>`
  });
}
