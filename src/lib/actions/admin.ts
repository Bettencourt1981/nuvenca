"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/admin";
import { errorCode, fail, ok, type ActionResult } from "@/lib/errors";

async function admin() {
  const user = await getCurrentUser();
  return user && isPlatformAdmin(user.email) ? user : null;
}

/** Put a workspace on a plan by hand (logged with the admin's name). */
export async function adminSetPlan(input: { workspaceId: string; planId: string }): Promise<ActionResult> {
  const user = await admin();
  if (!user) return fail("forbidden");
  const parsed = z.object({ workspaceId: z.string().uuid(), planId: z.string().min(1).max(40) }).safeParse(input);
  if (!parsed.success) return fail("generic");
  const { error } = await createAdminClient().rpc("admin_set_workspace_plan", {
    p_workspace_id: parsed.data.workspaceId,
    p_plan_id: parsed.data.planId,
    p_actor_id: user.id,
  });
  if (error) return fail(errorCode(error));
  refresh();
  return ok(undefined);
}

const GB = 1024 ** 3;
const MB = 1024 ** 2;
const money = z.number().min(0).max(100_000).nullable();

/** Edit a plan's limits and prices. Prices must match the Stripe prices with the plan's lookup keys. */
export async function adminUpdatePlan(input: {
  id: string;
  name: string;
  storageGb: number;
  maxFileSizeMb: number;
  maxMembers: number;
  trashDays: number;
  historyDays: number;
  auditDays: number;
  monthly: number | null;
  yearly: number | null;
  isPublic: boolean;
  forKind: "personal" | "team" | "";
  perSeat: boolean;
}): Promise<ActionResult> {
  const user = await admin();
  if (!user) return fail("forbidden");
  const parsed = z
    .object({
      id: z.string().min(1).max(40),
      name: z.string().trim().min(1).max(60),
      storageGb: z.number().min(0.1).max(1_000_000),
      maxFileSizeMb: z.number().min(1).max(1_000_000),
      maxMembers: z.number().int().min(1).max(100_000),
      trashDays: z.number().int().min(1).max(3650),
      historyDays: z.number().int().min(1).max(3650),
      auditDays: z.number().int().min(1).max(3650),
      monthly: money,
      yearly: money,
      isPublic: z.boolean(),
      forKind: z.enum(["personal", "team", ""]),
      perSeat: z.boolean(),
    })
    .safeParse(input);
  if (!parsed.success) return fail("generic");
  const p = parsed.data;
  const db = createAdminClient();
  const { data: current } = await db.from("plans").select("features").eq("id", p.id).maybeSingle();
  if (!current) return fail("not_found");
  const features: Record<string, unknown> = {
    ...((current.features ?? {}) as Record<string, unknown>),
    version_history_days: p.historyDays,
    audit_log_days: p.auditDays,
    per_seat: p.perSeat,
  };
  if (p.forKind) features.for = p.forKind;
  else delete features.for;
  const { error } = await db
    .from("plans")
    .update({
      name: p.name,
      storage_quota_bytes: Math.round(p.storageGb * GB),
      max_file_size_bytes: Math.round(p.maxFileSizeMb * MB),
      max_members: p.maxMembers,
      trash_retention_days: p.trashDays,
      features: features as never,
      price_monthly_cents: p.monthly === null ? null : Math.round(p.monthly * 100),
      price_yearly_cents: p.yearly === null ? null : Math.round(p.yearly * 100),
      is_public: p.isPublic,
    })
    .eq("id", p.id);
  if (error) return fail(errorCode(error));
  refresh();
  return ok(undefined);
}
