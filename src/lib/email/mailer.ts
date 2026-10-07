import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

/**
 * Transactional email over SMTP, so any provider works (Resend, Brevo,
 * Amazon SES, Mailgun, Postmark…). Without SMTP settings, sending is skipped
 * and sharing works as before.
 */
let cached: Transporter | null | undefined;

export function emailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.EMAIL_FROM);
}

function transporter(): Transporter | null {
  if (cached !== undefined) return cached;
  if (!emailConfigured()) return (cached = null);
  const port = Number(process.env.SMTP_PORT || 587);
  cached = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? "" } : undefined,
  });
  return cached;
}

export type Email = { to: string; subject: string; html: string; text: string; replyTo?: string };

/** Send an email; returns false when email is not configured. Throws on SMTP errors. */
export async function sendEmail(email: Email): Promise<boolean> {
  const transport = transporter();
  if (!transport) return false;
  await transport.sendMail({ from: process.env.EMAIL_FROM, ...email });
  return true;
}
