import { type NextRequest, NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { routing } from "@/i18n/routing";
import { supabasePublishableKey, supabaseUrl } from "@/lib/env";

const handleI18n = createIntlMiddleware(routing);

// Pages that require a signed-in user, and auth pages signed-in users skip.
const PROTECTED = [
  "/drive",
  "/workspaces",
  "/shared",
  "/recent",
  "/starred",
  "/trash",
  "/search",
  "/settings",
  "/file",
  "/document",
  "/spreadsheet",
  "/admin",
];
const GUEST_ONLY = ["/", "/login", "/signup"];

function appPath(pathname: string): string {
  const stripped = pathname.replace(new RegExp(`^/(${routing.locales.join("|")})(?=/|$)`), "");
  return stripped === "" ? "/" : stripped;
}

const matches = (path: string, prefixes: string[]) =>
  prefixes.some((prefix) => path === prefix || (prefix !== "/" && path.startsWith(`${prefix}/`)));

/**
 * Runs before every page and API request:
 * 1. Refreshes the Supabase session so Server Components see a valid token.
 * 2. Resolves the interface language (pages only).
 */
export async function proxy(request: NextRequest) {
  const pendingCookies: { name: string; value: string; options: CookieOptions }[] = [];
  const pendingHeaders: Record<string, string> = {};

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        // Make the refreshed tokens visible to this request's render...
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        // ...and send them back to the browser.
        pendingCookies.push(...cookiesToSet);
        Object.assign(pendingHeaders, headers);
      },
    },
  });

  // Validates the JWT and refreshes it when expired. Do not remove.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  const isApi = request.nextUrl.pathname.startsWith("/api/");
  const path = appPath(request.nextUrl.pathname);
  let response: NextResponse;

  if (!isApi && !signedIn && matches(path, PROTECTED)) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", path + request.nextUrl.search);
    response = NextResponse.redirect(url);
  } else if (!isApi && signedIn && matches(path, GUEST_ONLY)) {
    response = NextResponse.redirect(new URL("/drive", request.url));
  } else {
    response = isApi ? NextResponse.next({ request: { headers: request.headers } }) : handleI18n(request);
  }

  pendingCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  Object.entries(pendingHeaders).forEach(([key, value]) => response.headers.set(key, value));
  return response;
}

export const config = {
  // Everything except Next.js internals and files with an extension.
  matcher: ["/((?!_next|_vercel|.*\\..*).*)"],
};
