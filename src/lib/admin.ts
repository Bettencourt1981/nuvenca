import "server-only";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

/**
 * People who run Nuvenca: the verified emails in PLATFORM_ADMIN_EMAILS
 * (comma-separated). The admin console is invisible to everyone else.
 */
function adminEmails(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformAdmin(email: string | null | undefined): boolean {
  return Boolean(email) && adminEmails().includes(email!.toLowerCase());
}

/** The signed-in platform admin, or a 404 for anyone else. */
export async function requirePlatformAdmin() {
  const user = await getCurrentUser();
  if (!user || !isPlatformAdmin(user.email)) notFound();
  return user;
}
