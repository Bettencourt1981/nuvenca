import "server-only";
import { createTranslator } from "next-intl";
import en from "@/messages/en.json";
import pt from "@/messages/pt.json";
import { routing } from "@/i18n/routing";
import type { Email } from "./mailer";

const MESSAGES = { en, pt } as const;
type Locale = keyof typeof MESSAGES;

function pickLocale(...candidates: (string | null | undefined)[]): Locale {
  for (const candidate of candidates) {
    const base = candidate?.toLowerCase().split(/[-_]/)[0];
    if (base && (routing.locales as readonly string[]).includes(base)) return base as Locale;
  }
  return routing.defaultLocale as Locale;
}

function translator(locale: Locale) {
  return createTranslator({ locale, messages: MESSAGES[locale], namespace: "email" });
}

/** Names come from users: keep headers on one line. */
const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ").slice(0, 200);

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A plain, client-safe layout: one card, one button, a footer. */
function layout(parts: { heading: string; paragraphs: string[]; quote?: string; button: { label: string; url: string }; hint?: string; footer: string }) {
  const p = (text: string) => `<p style="margin:0 0 12px;font-size:15px;line-height:22px;color:#1f2937">${escapeHtml(text)}</p>`;
  const html = `<!doctype html>
<html><body style="margin:0;padding:24px 12px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:28px">
<tr><td>
<p style="margin:0 0 20px;font-size:18px;font-weight:bold;color:#2563eb">Nuvenca</p>
<h1 style="margin:0 0 16px;font-size:20px;line-height:28px;color:#111827">${escapeHtml(parts.heading)}</h1>
${parts.paragraphs.map(p).join("\n")}
${parts.quote ? `<blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #2563eb;background:#eff6ff;font-size:15px;line-height:22px;color:#1f2937;white-space:pre-wrap">${escapeHtml(parts.quote)}</blockquote>` : ""}
<p style="margin:24px 0"><a href="${escapeHtml(parts.button.url)}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#2563eb;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none">${escapeHtml(parts.button.label)}</a></p>
${parts.hint ? `<p style="margin:0 0 12px;font-size:13px;line-height:20px;color:#4b5563">${escapeHtml(parts.hint)}</p>` : ""}
</td></tr></table>
<p style="max-width:520px;margin:16px auto 0;font-size:12px;line-height:18px;color:#6b7280">${escapeHtml(parts.footer)}</p>
</td></tr></table>
</body></html>`;
  const text = [
    parts.heading,
    "",
    ...parts.paragraphs,
    ...(parts.quote ? ["", parts.quote.replace(/^/gm, "> ")] : []),
    "",
    `${parts.button.label}: ${parts.button.url}`,
    ...(parts.hint ? ["", parts.hint] : []),
    "",
    "--",
    parts.footer,
  ].join("\n");
  return { html, text };
}

export type ShareNotification = {
  recipient: string;
  recipientLocale: string | null;
  hasAccount: boolean;
  itemName: string;
  itemKind: "folder" | "document" | "spreadsheet" | "file";
  role: "viewer" | "commenter" | "editor";
  senderName: string;
  senderEmail: string;
  message?: string;
  /** Where the button goes: the item, or sign-up for people without an account. */
  url: string;
};

export function fileSharedEmail(n: ShareNotification, fallbackLocale?: string): Email {
  const t = translator(pickLocale(n.recipientLocale, fallbackLocale));
  const subject =
    n.itemKind === "folder"
      ? t("fileShared.subjectFolder", { name: n.senderName, item: n.itemName })
      : t("fileShared.subjectFile", { name: n.senderName, item: n.itemName });
  const { html, text } = layout({
    heading: subject,
    paragraphs: [
      t("fileShared.intro", { name: n.senderName, email: n.senderEmail, kind: n.itemKind }),
      t("fileShared.role", { role: n.role }),
      ...(n.message ? [t("fileShared.messageLabel", { name: n.senderName })] : []),
    ],
    quote: n.message,
    button: { label: n.hasAccount ? t("fileShared.open") : t("fileShared.signUp"), url: n.url },
    hint: n.hasAccount ? undefined : t("fileShared.signUpHint", { email: n.recipient }),
    footer: t("fileShared.footer", { email: n.recipient }),
  });
  return { to: n.recipient, subject: oneLine(subject), html, text, replyTo: n.senderEmail };
}

export type MemberNotification = {
  recipient: string;
  recipientLocale: string | null;
  workspaceName: string;
  senderName: string;
  senderEmail: string;
  url: string;
};

export function memberAddedEmail(n: MemberNotification, fallbackLocale?: string): Email {
  const t = translator(pickLocale(n.recipientLocale, fallbackLocale));
  const subject = t("member.subject", { name: n.senderName, workspace: n.workspaceName });
  const { html, text } = layout({
    heading: subject,
    paragraphs: [t("member.intro", { name: n.senderName, email: n.senderEmail, workspace: n.workspaceName }), t("member.body")],
    button: { label: t("member.open"), url: n.url },
    footer: t("member.footer", { email: n.recipient }),
  });
  return { to: n.recipient, subject: oneLine(subject), html, text, replyTo: n.senderEmail };
}
