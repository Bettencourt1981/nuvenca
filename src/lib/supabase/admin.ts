import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Privileged client that bypasses RLS. Only use it on the server, after the
 * caller's permissions have been checked (e.g. to sign storage URLs).
 */
export function createAdminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error("SUPABASE_SECRET_KEY is not configured");
  }
  return createClient<Database>(supabaseUrl, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
