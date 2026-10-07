"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/env";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { billingConfigured, lookupKey, stripe, type BillingInterval } from "@/lib/billing/stripe";

const id = z.string().uuid();

/** The workspace, if the caller owns it (only owners handle billing). */
async function ownedWorkspace(workspaceId: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return null;
  const { data: member } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (member?.role !== "owner") return null;
  const { data: workspace } = await supabase.from("workspaces").select("id, name, kind").eq("id", workspaceId).maybeSingle();
  if (!workspace) return null;
  const { data: profile } = await supabase.from("profiles").select("email, full_name").eq("id", userId).maybeSingle();
  return { ...workspace, userEmail: profile?.email ?? "", userName: profile?.full_name ?? "" };
}

const returnPath = (workspace: { id: string; kind: string }) =>
  workspace.kind === "team" ? `/workspaces/${workspace.id}/settings` : "/settings";

/** Start a Stripe Checkout for a plan; returns the page to send the owner to. */
export async function startCheckout(input: {
  workspaceId: string;
  planId: string;
  interval: BillingInterval;
  locale?: string;
}): Promise<ActionResult<{ url: string }>> {
  const parsed = z
    .object({ workspaceId: id, planId: z.string().max(40), interval: z.enum(["monthly", "yearly"]), locale: z.string().max(10).optional() })
    .safeParse(input);
  if (!parsed.success) return fail("generic");
  if (!billingConfigured()) return fail("billing_unavailable");
  const workspace = await ownedWorkspace(parsed.data.workspaceId);
  if (!workspace) return fail("forbidden");

  const admin = createAdminClient();
  const { data: plan } = await admin
    .from("plans")
    .select("id, is_public, features, price_monthly_cents, price_yearly_cents")
    .eq("id", parsed.data.planId)
    .maybeSingle();
  const features = (plan?.features ?? {}) as { for?: string; per_seat?: boolean };
  const price = parsed.data.interval === "monthly" ? plan?.price_monthly_cents : plan?.price_yearly_cents;
  if (!plan || !plan.is_public || !price || features.for !== workspace.kind) return fail("invalid_plan");

  const { data: current } = await admin.from("subscriptions").select("status, provider").eq("workspace_id", workspace.id).maybeSingle();
  if (current?.provider === "stripe" && current.status !== "canceled") return fail("already_subscribed");

  try {
    const prices = await stripe().prices.list({ lookup_keys: [lookupKey(plan.id, parsed.data.interval)], active: true, limit: 1 });
    const stripePrice = prices.data[0];
    if (!stripePrice) return fail("billing_unavailable");

    let { data: customer } = await admin.from("billing_customers").select("customer_id").eq("workspace_id", workspace.id).maybeSingle();
    if (!customer) {
      const created = await stripe().customers.create({
        email: workspace.userEmail || undefined,
        name: workspace.kind === "team" ? workspace.name : workspace.userName || undefined,
        preferred_locales: [parsed.data.locale === "en" ? "en" : "pt"],
        metadata: { workspace_id: workspace.id },
      });
      const { error: linkError } = await admin.from("billing_customers").insert({ workspace_id: workspace.id, customer_id: created.id });
      if (linkError) {
        console.error("Could not record the Stripe customer", linkError.message);
        return fail("billing_unavailable");
      }
      customer = { customer_id: created.id };
    }

    let quantity = 1;
    if (features.per_seat) {
      const { count } = await admin.from("workspace_members").select("user_id", { count: "exact", head: true }).eq("workspace_id", workspace.id);
      quantity = Math.max(count ?? 1, 1);
    }
    const back = `${siteUrl()}${returnPath(workspace)}`;
    const metadata = { workspace_id: workspace.id, plan_id: plan.id };
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      customer: customer.customer_id,
      client_reference_id: workspace.id,
      line_items: [{ price: stripePrice.id, quantity }],
      subscription_data: { metadata },
      metadata,
      allow_promotion_codes: true,
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
      customer_update: { address: "auto", name: "auto" },
      ...(process.env.STRIPE_AUTOMATIC_TAX === "true" ? { automatic_tax: { enabled: true } } : {}),
      locale: parsed.data.locale === "en" ? "en" : "pt",
      success_url: `${back}?billing=success`,
      cancel_url: `${back}?billing=canceled`,
    });
    if (!session.url) return fail("billing_unavailable");
    return ok({ url: session.url });
  } catch (error) {
    console.error("Stripe checkout failed", error instanceof Error ? error.message : error);
    return fail("billing_unavailable");
  }
}

/** Stripe's customer portal: payment methods, invoices, plan changes, cancellation. */
export async function openBillingPortal(input: { workspaceId: string; locale?: string }): Promise<ActionResult<{ url: string }>> {
  const parsed = z.object({ workspaceId: id, locale: z.string().max(10).optional() }).safeParse(input);
  if (!parsed.success) return fail("generic");
  if (!billingConfigured()) return fail("billing_unavailable");
  const workspace = await ownedWorkspace(parsed.data.workspaceId);
  if (!workspace) return fail("forbidden");
  const admin = createAdminClient();
  const { data: customer } = await admin.from("billing_customers").select("customer_id").eq("workspace_id", workspace.id).maybeSingle();
  if (!customer) return fail("not_found");
  try {
    const session = await stripe().billingPortal.sessions.create({
      customer: customer.customer_id,
      return_url: `${siteUrl()}${returnPath(workspace)}`,
      locale: parsed.data.locale === "en" ? "en" : "pt",
    });
    return ok({ url: session.url });
  } catch (error) {
    console.error("Stripe portal failed", error instanceof Error ? error.message : error);
    return fail("billing_unavailable");
  }
}
