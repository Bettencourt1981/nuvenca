"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { adminSetPlan } from "@/lib/actions/admin";
import { useErrorMessage } from "@/hooks/use-error-message";

/** Plan picker for one workspace row. */
export function SetPlan({
  workspaceId,
  planId,
  plans,
  stripe,
}: {
  workspaceId: string;
  planId: string;
  plans: { id: string; name: string }[];
  stripe: boolean;
}) {
  const t = useTranslations("admin");
  const message = useErrorMessage();
  const [value, setValue] = useState(planId);
  const [pending, startTransition] = useTransition();
  return (
    <span className="flex items-center gap-1">
      <select
        value={value}
        disabled={pending}
        aria-label={t("setPlan")}
        title={stripe ? t("stripeWarning") : t("setPlan")}
        onChange={(event) => {
          const next = event.target.value;
          setValue(next);
          startTransition(async () => {
            const result = await adminSetPlan({ workspaceId, planId: next });
            if (!result.ok) {
              setValue(planId);
              toast.error(message(result.error));
            } else toast.success(t("planChanged"));
          });
        }}
        className="h-8 rounded-md border border-border bg-surface px-2 text-sm"
      >
        {plans.map((plan) => (
          <option key={plan.id} value={plan.id}>
            {plan.name}
          </option>
        ))}
      </select>
    </span>
  );
}
