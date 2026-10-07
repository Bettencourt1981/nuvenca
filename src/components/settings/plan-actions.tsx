"use client";

import { useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, CreditCard } from "lucide-react";
import { openBillingPortal, startCheckout } from "@/lib/actions/billing";
import { useErrorMessage } from "@/hooks/use-error-message";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export type PlanOffer = {
  id: string;
  name: string;
  monthly: string | null;
  yearly: string | null;
  perSeat: boolean;
  highlights: string[];
};

export function PlanActions({
  workspaceId,
  offers,
  canManage,
  canUpgrade,
}: {
  workspaceId: string;
  offers: PlanOffer[];
  canManage: boolean;
  canUpgrade: boolean;
}) {
  const t = useTranslations("billing");
  const locale = useLocale();
  const message = useErrorMessage();
  const searchParams = useSearchParams();
  const [interval, setBillingInterval] = useState<"monthly" | "yearly">(offers.some((o) => o.monthly) ? "monthly" : "yearly");
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  // Coming back from Stripe Checkout.
  const outcome = searchParams.get("billing");
  useEffect(() => {
    if (outcome === "success") toast.success(t("checkoutSuccess"));
    else if (outcome === "canceled") toast(t("checkoutCanceled"));
  }, [outcome, t]);

  const go = (key: string, action: () => Promise<{ ok: true; data: { url: string } } | { ok: false; error: string }>) => {
    setBusy(key);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setBusy(null);
        toast.error(message(result.error));
        return;
      }
      window.location.assign(result.data.url);
    });
  };

  const hasYearly = offers.some((o) => o.yearly);
  const hasMonthly = offers.some((o) => o.monthly);

  return (
    <div className="space-y-4">
      {canManage ? (
        <Button variant="secondary" disabled={pending} onClick={() => go("portal", () => openBillingPortal({ workspaceId, locale }))}>
          {busy === "portal" ? <Spinner className="size-4" /> : <CreditCard className="size-4" />}
          {t("manage")}
        </Button>
      ) : null}

      {offers.length > 0 ? (
        <div className="space-y-3">
          {hasYearly && hasMonthly ? (
            <div className="inline-flex rounded-lg border border-border p-0.5 text-sm" role="radiogroup" aria-label={t("interval")}>
              {(["monthly", "yearly"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={interval === value}
                  onClick={() => setBillingInterval(value)}
                  className={cn("rounded-md px-3 py-1", interval === value ? "bg-primary text-primary-foreground" : "text-muted hover:text-foreground")}
                >
                  {t(value)}
                </button>
              ))}
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {offers.map((offer) => {
              const price = interval === "monthly" ? offer.monthly : offer.yearly;
              if (!price) return null;
              return (
                <div key={offer.id} className="flex flex-col rounded-xl border border-border p-4" data-plan={offer.id}>
                  <p className="font-semibold">{offer.name}</p>
                  <p className="mt-1">
                    <span className="text-2xl font-semibold">{price}</span>{" "}
                    <span className="text-sm text-muted">{t(interval === "monthly" ? "perMonth" : "perYear", { seat: String(offer.perSeat) })}</span>
                  </p>
                  <ul className="mt-3 flex-1 space-y-1 text-sm">
                    {offer.highlights.map((line) => (
                      <li key={line} className="flex items-start gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                        {line}
                      </li>
                    ))}
                  </ul>
                  {canUpgrade ? (
                    <Button
                      className="mt-4"
                      disabled={pending}
                      onClick={() => go(offer.id, () => startCheckout({ workspaceId, planId: offer.id, interval, locale }))}
                    >
                      {busy === offer.id ? <Spinner className="size-4" /> : null}
                      {t("upgrade", { plan: offer.name })}
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted">{t("taxNote")}</p>
        </div>
      ) : null}
    </div>
  );
}
