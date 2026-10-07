import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { STORAGE_BUCKET } from "@/lib/env";

/**
 * Daily job (see vercel.json): deletes trash past its retention period and
 * abandoned uploads, then removes their objects from Storage. Also forgets
 * old entries of the email log, the activity log (per plan) and notifications.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: paths, error } = await admin.rpc("purge_expired_items");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  for (let i = 0; i < (paths ?? []).length; i += 100) {
    const { error: removeError } = await admin.storage.from(STORAGE_BUCKET).remove(paths!.slice(i, i + 100));
    if (removeError) console.error("cleanup: failed to remove objects", removeError);
  }
  const { data: prunedEmails, error: pruneError } = await admin.rpc("prune_notification_log");
  if (pruneError) console.error("cleanup: failed to prune the email log", pruneError);
  const { data: prunedActivity, error: activityError } = await admin.rpc("prune_activity");
  if (activityError) console.error("cleanup: failed to prune activity and notifications", activityError);
  return NextResponse.json({ removedObjects: paths?.length ?? 0, prunedEmails: prunedEmails ?? 0, prunedActivity });
}
