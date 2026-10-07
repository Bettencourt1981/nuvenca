import { type NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing point for links that come back from Supabase Auth:
 * - OAuth sign-in (Google) and email links in the PKCE flow send `?code=`.
 * - Custom email templates may send `?token_hash=&type=`.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const nextParam = searchParams.get("next") ?? "/drive";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/drive";

  const supabase = await createClient();
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
      : { error: new Error("missing_code") };

  const target = new URL(error ? "/login?error=link" : next, request.nextUrl.origin);
  return NextResponse.redirect(target);
}
