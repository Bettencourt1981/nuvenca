// Accept both the new (publishable/secret) and legacy (anon/service_role)
// Supabase key names, so either the Vercel integration or a manual setup works.
// `NEXT_PUBLIC_*` values must be read with literal property access so Next.js
// can inline them into the browser bundle.

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  return vercel ? `https://${vercel}` : "http://localhost:3000";
}

export const STORAGE_BUCKET = "files";
