import "server-only";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Stripe is optional: without STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET the
 * app shows plans but offers no checkout. STRIPE_API_BASE points the SDK at
 * another API host (used by the test suite's local Stripe stand-in).
 */
export function billingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (client) return client;
  const base = process.env.STRIPE_API_BASE ? new URL(process.env.STRIPE_API_BASE) : null;
  client = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
    appInfo: { name: "Nuvenca" },
    maxNetworkRetries: 2,
    ...(base
      ? {
          host: base.hostname,
          port: base.port || (base.protocol === "https:" ? 443 : 80),
          protocol: base.protocol === "https:" ? ("https" as const) : ("http" as const),
        }
      : {}),
  });
  return client;
}

export type BillingInterval = "monthly" | "yearly";

/** Stripe price lookup key for a plan: `nuvenca_pro_monthly`. */
export const lookupKey = (planId: string, interval: BillingInterval) => `nuvenca_${planId}_${interval}`;

export function planFromLookupKey(key: string | null | undefined): string | null {
  const match = /^nuvenca_([a-z0-9_-]+?)_(monthly|yearly)$/.exec(key ?? "");
  return match ? match[1] : null;
}

/** Fetch a subscription from Stripe and apply it to its workspace (webhooks, seat changes). */
export async function syncSubscription(subscriptionId: string) {
  const subscription = await stripe().subscriptions.retrieve(subscriptionId, { expand: ["items.data.price"] });
  const admin = createAdminClient();
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  let workspaceId: string | null = subscription.metadata?.workspace_id ?? null;
  if (!workspaceId) {
    const { data } = await admin.from("billing_customers").select("workspace_id").eq("customer_id", customerId).maybeSingle();
    workspaceId = data?.workspace_id ?? null;
  }
  if (!workspaceId) throw new Error(`No workspace for subscription ${subscriptionId}`);
  const item = subscription.items.data[0];
  const planId = planFromLookupKey(item?.price?.lookup_key) ?? subscription.metadata?.plan_id;
  if (!planId) throw new Error(`No plan for subscription ${subscriptionId}`);
  const toDate = (seconds: number | null | undefined) => (seconds ? new Date(seconds * 1000).toISOString() : null);
  const { error } = await admin.rpc("apply_subscription", {
    p_workspace_id: workspaceId,
    p_plan_id: planId,
    p_status: subscription.status,
    p_provider_subscription_id: subscription.id,
    p_provider_customer_id: customerId,
    p_period_start: toDate(item?.current_period_start) as string,
    p_period_end: toDate(item?.current_period_end) as string,
    p_cancel_at_period_end: subscription.cancel_at_period_end,
  });
  if (error) throw new Error(error.message);
}

/** Per-seat plans: keep the subscription's quantity equal to the team's size. */
export async function syncSeats(workspaceId: string) {
  if (!billingConfigured()) return;
  const admin = createAdminClient();
  const { data: workspace } = await admin.from("workspaces").select("plan_id, plans(features)").eq("id", workspaceId).maybeSingle();
  const features = (workspace?.plans?.features ?? {}) as { per_seat?: boolean };
  if (!features.per_seat) return;
  const { data: sub } = await admin
    .from("subscriptions")
    .select("provider, provider_subscription_id, status")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!sub?.provider_subscription_id || sub.provider !== "stripe" || sub.status === "canceled") return;
  const { count } = await admin.from("workspace_members").select("user_id", { count: "exact", head: true }).eq("workspace_id", workspaceId);
  const subscription = await stripe().subscriptions.retrieve(sub.provider_subscription_id);
  const item = subscription.items.data[0];
  if (!item || item.quantity === count) return;
  await stripe().subscriptions.update(sub.provider_subscription_id, {
    items: [{ id: item.id, quantity: Math.max(count ?? 1, 1) }],
    proration_behavior: "create_prorations",
  });
}
