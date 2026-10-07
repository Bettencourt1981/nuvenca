import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getPlans } from "@/lib/data/drive";
import { billingConfigured } from "@/lib/billing/stripe";
import { formatBytes } from "@/lib/utils";
import type { WorkspaceSummary } from "@/lib/types";
import { PlanActions, type PlanOffer } from "./plan-actions";

/** Current plan, subscription state, and upgrade / manage-billing actions. */
export async function PlanSection({ workspace }: { workspace: WorkspaceSummary }) {
  const [t, format, locale, plans] = await Promise.all([getTranslations("billing"), getFormatter(), getLocale(), getPlans()]);
  const supabase = await createClient();
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan_id, status, provider, current_period_end, cancel_at_period_end")
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  const isOwner = workspace.role === "owner";
  const configured = billingConfigured();
  const subscribed = subscription?.provider === "stripe" && subscription.status !== "canceled";
  const date = (iso: string | null) => (iso ? format.dateTime(new Date(iso), { dateStyle: "long" }) : "");

  let status: { text: string; tone: "muted" | "danger" } | null = null;
  if (subscribed) {
    if (subscription.status === "past_due") status = { text: t("pastDue"), tone: "danger" };
    else if (subscription.cancel_at_period_end) status = { text: t("endsOn", { date: date(subscription.current_period_end) }), tone: "muted" };
    else if (subscription.status === "trialing") status = { text: t("trialUntil", { date: date(subscription.current_period_end) }), tone: "muted" };
    else if (subscription.current_period_end) status = { text: t("renewsOn", { date: date(subscription.current_period_end) }), tone: "muted" };
  }

  const offers: PlanOffer[] = configured && !subscribed
    ? plans
        .filter((p) => p.isPublic && p.id !== workspace.planId && p.features.for === workspace.kind && (p.priceMonthlyCents || p.priceYearlyCents))
        .map((p) => ({
          id: p.id,
          name: p.name,
          monthly: p.priceMonthlyCents ? format.number(p.priceMonthlyCents / 100, { style: "currency", currency: p.currency }) : null,
          yearly: p.priceYearlyCents ? format.number(p.priceYearlyCents / 100, { style: "currency", currency: p.currency }) : null,
          perSeat: p.features.per_seat === true,
          highlights: [
            t("storage", { size: formatBytes(p.storageQuotaBytes, locale) }),
            t("fileSize", { size: formatBytes(p.maxFileSizeBytes, locale) }),
            ...(workspace.kind === "team" ? [t("members", { count: p.maxMembers })] : []),
            t("history", { days: Number(p.features.version_history_days ?? 30) }),
          ],
        }))
    : [];

  return (
    <div className="space-y-4">
      <div>
        <p className="font-medium">{t("current", { plan: workspace.planName })}</p>
        {status ? <p className={status.tone === "danger" ? "text-sm text-danger" : "text-sm text-muted"}>{status.text}</p> : null}
      </div>
      <PlanActions
        workspaceId={workspace.id}
        offers={offers}
        canManage={isOwner && configured && subscription?.provider === "stripe"}
        canUpgrade={isOwner}
      />
      {!isOwner && (offers.length > 0 || subscribed) ? <p className="text-sm text-muted">{t("ownerOnly")}</p> : null}
      {!configured ? <p className="text-sm text-muted">{t("comingSoon")}</p> : null}
    </div>
  );
}
