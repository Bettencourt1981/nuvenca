"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { adminUpdatePlan } from "@/lib/actions/admin";
import { useErrorMessage } from "@/hooks/use-error-message";
import { Button } from "@/components/ui/button";

export type EditablePlan = {
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
};

const inputClass = "mt-1 h-9 w-full rounded-lg border border-border bg-surface px-2 text-sm focus:border-primary focus:outline-none";

/** Edit one plan's limits, prices and availability. */
export function PlanEditor({ plan }: { plan: EditablePlan }) {
  const t = useTranslations("admin.plan");
  const message = useErrorMessage();
  const [pending, startTransition] = useTransition();

  const number = (form: FormData, key: string) => Number(String(form.get(key) ?? "").replace(",", "."));
  const price = (form: FormData, key: string) => {
    const raw = String(form.get(key) ?? "").trim().replace(",", ".");
    return raw === "" ? null : Number(raw);
  };

  return (
    <form
      className="rounded-2xl border border-border bg-surface p-5"
      data-plan={plan.id}
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await adminUpdatePlan({
            id: plan.id,
            name: String(form.get("name") ?? ""),
            storageGb: number(form, "storageGb"),
            maxFileSizeMb: number(form, "maxFileSizeMb"),
            maxMembers: number(form, "maxMembers"),
            trashDays: number(form, "trashDays"),
            historyDays: number(form, "historyDays"),
            auditDays: number(form, "auditDays"),
            monthly: price(form, "monthly"),
            yearly: price(form, "yearly"),
            isPublic: form.get("isPublic") === "on",
            forKind: String(form.get("forKind") ?? "") as EditablePlan["forKind"],
            perSeat: form.get("perSeat") === "on",
          });
          if (result.ok) toast.success(t("saved"));
          else toast.error(message(result.error));
        });
      }}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-semibold">
          {plan.name} <span className="font-mono text-xs font-normal text-muted">{plan.id}</span>
        </h2>
        <Button type="submit" size="sm" disabled={pending}>
          {t("save")}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          {t("name")}
          <input name="name" defaultValue={plan.name} required maxLength={60} className={inputClass} />
        </label>
        <label className="text-sm">
          {t("storageGb")}
          <input name="storageGb" type="number" step="0.1" min="0.1" defaultValue={plan.storageGb} className={inputClass} />
        </label>
        <label className="text-sm">
          {t("maxFileSizeMb")}
          <input name="maxFileSizeMb" type="number" min="1" defaultValue={plan.maxFileSizeMb} className={inputClass} />
        </label>
        <label className="text-sm">
          {t("maxMembers")}
          <input name="maxMembers" type="number" min="1" defaultValue={plan.maxMembers} className={inputClass} />
        </label>
        <label className="text-sm">
          {t("trashDays")}
          <input name="trashDays" type="number" min="1" defaultValue={plan.trashDays} className={inputClass} />
        </label>
        <label className="text-sm">
          {t("historyDays")}
          <input name="historyDays" type="number" min="1" defaultValue={plan.historyDays} className={inputClass} />
        </label>
        <label className="text-sm">
          {t("auditDays")}
          <input name="auditDays" type="number" min="1" defaultValue={plan.auditDays} className={inputClass} />
        </label>
        <label className="text-sm">
          {t("monthly")}
          <input name="monthly" inputMode="decimal" defaultValue={plan.monthly ?? ""} className={inputClass} />
        </label>
        <label className="text-sm">
          {t("yearly")}
          <input name="yearly" inputMode="decimal" defaultValue={plan.yearly ?? ""} className={inputClass} />
        </label>
        <label className="text-sm">
          {t("for")}
          <select name="forKind" defaultValue={plan.forKind} className={inputClass}>
            <option value="">{t("forNone")}</option>
            <option value="personal">{t("forPersonal")}</option>
            <option value="team">{t("forTeam")}</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm sm:pt-6">
          <input name="perSeat" type="checkbox" defaultChecked={plan.perSeat} className="size-4 accent-primary" />
          {t("perSeat")}
        </label>
        <label className="flex items-center gap-2 text-sm sm:pt-6">
          <input name="isPublic" type="checkbox" defaultChecked={plan.isPublic} className="size-4 accent-primary" />
          {t("isPublic")}
        </label>
      </div>
      <p className="mt-3 text-xs text-muted">
        {t("lookupKeys", { monthly: `nuvenca_${plan.id}_monthly`, yearly: `nuvenca_${plan.id}_yearly` })}
      </p>
    </form>
  );
}
