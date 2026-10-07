/**
 * Only allow redirects to paths inside the app. Rejects absolute URLs and
 * protocol-relative tricks such as `//evil.com` or `/\evil.com`.
 */
export function safeNextPath(next: unknown, fallback = "/drive"): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//")) return fallback;
  if (next.includes("\\") || /[\u0000-\u001f]/.test(next)) return fallback;
  return next;
}
