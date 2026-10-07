/** Result type returned by every Server Action. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });
export const fail = (error: string): ActionResult<never> => ({ ok: false, error });

// Error messages raised by the database functions and Supabase Auth that have
// a translation under `errors.*`.
const KNOWN = new Set([
  "not_authenticated",
  "not_found",
  "forbidden",
  "invalid_name",
  "invalid_email",
  "invalid_size",
  "invalid_target",
  "quota_exceeded",
  "file_too_large",
  "member_limit_reached",
  "user_not_found",
  "already_member",
  "cannot_share_with_self",
  "cannot_move_into_itself",
  "parent_in_trash",
  "parent_other_workspace",
  "not_in_trash",
  "upload_failed",
  "invalid_credentials",
  "email_not_confirmed",
  "user_already_exists",
  "weak_password",
  "over_email_send_rate_limit",
  "same_password",
  "not_native",
  "invalid_payload",
  "invalid_type",
  "invalid_comment",
  "unsupported_type",
  "rate_limited",
]);

/** Map a Supabase/PostgREST/Auth error to a translatable error code. */
export function errorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "generic";
  const { message, code } = error as { message?: string; code?: string };
  if (code && KNOWN.has(code)) return code;
  if (message && KNOWN.has(message)) return message;
  if (code === "42501") return "forbidden";
  if (code === "parent_in_trash" || message === "parent_not_folder") return "invalid_target";
  if (code === "email_address_invalid" || code === "validation_failed") return "invalid_email";
  if (code === "user_already_registered" || code === "email_exists") return "user_already_exists";
  return "generic";
}
