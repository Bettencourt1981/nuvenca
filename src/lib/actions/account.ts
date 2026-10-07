"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/env";
import { errorCode, fail, ok, type ActionResult } from "@/lib/errors";
import { routing } from "@/i18n/routing";
import { safeNextPath } from "@/lib/safe-redirect";

const email = z.string().trim().toLowerCase().email().max(320);
const password = z.string().min(8).max(72);
const locale = z.enum(routing.locales);

const safeNext = (next: unknown) => safeNextPath(next);

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return siteUrl();
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function signIn(input: { email: string; password: string; next?: string }): Promise<ActionResult> {
  const parsed = z.object({ email, password: z.string().min(1).max(72) }).safeParse(input);
  if (!parsed.success) return fail("invalid_credentials");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return fail(errorCode(error));
  redirect(safeNext(input.next));
}

export async function signUp(input: {
  email: string;
  password: string;
  fullName: string;
  locale: string;
}): Promise<ActionResult<{ needsConfirmation: boolean }>> {
  const parsed = z
    .object({ email, password, fullName: z.string().trim().max(120), locale })
    .safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return fail(field === "password" ? "weak_password" : "invalid_email");
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${await origin()}/api/auth/callback?next=/drive`,
      data: { full_name: parsed.data.fullName, locale: parsed.data.locale },
    },
  });
  if (error) return fail(errorCode(error));
  // With email confirmation enabled there is no session until the link is opened.
  if (!data.session) return ok({ needsConfirmation: true });
  redirect("/drive");
}

export async function signInWithGoogle(input: { next?: string }): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await origin()}/api/auth/callback?next=${encodeURIComponent(safeNext(input.next))}` },
  });
  if (error || !data.url) return fail(errorCode(error));
  redirect(data.url);
}

export async function requestPasswordReset(input: { email: string }): Promise<ActionResult> {
  const parsed = z.object({ email }).safeParse(input);
  if (!parsed.success) return fail("invalid_email");
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await origin()}/api/auth/callback?next=/reset-password`,
  });
  // Don't reveal whether the account exists; only surface rate limiting.
  if (error && errorCode(error) === "over_email_send_rate_limit") return fail("over_email_send_rate_limit");
  return ok(undefined);
}

export async function updatePassword(input: { password: string }): Promise<ActionResult> {
  const parsed = z.object({ password }).safeParse(input);
  if (!parsed.success) return fail("weak_password");
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return fail(errorCode(error));
  return ok(undefined);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function updateProfile(input: { fullName: string; locale: string }): Promise<ActionResult> {
  const parsed = z.object({ fullName: z.string().trim().max(120), locale }).safeParse(input);
  if (!parsed.success) return fail("invalid_name");
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_profile", {
    p_full_name: parsed.data.fullName,
    p_locale: parsed.data.locale,
  });
  if (error) return fail(errorCode(error));
  refresh();
  return ok(undefined);
}

/** Remember the interface language on the profile (emails use it). */
export async function saveLanguage(input: { locale: string }): Promise<ActionResult> {
  const parsed = z.object({ locale }).safeParse(input);
  if (!parsed.success) return fail("generic");
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return fail("not_authenticated");
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle();
  const { error } = await supabase.rpc("update_profile", {
    p_full_name: profile?.full_name ?? "",
    p_locale: parsed.data.locale,
  });
  if (error) return fail(errorCode(error));
  return ok(undefined);
}
