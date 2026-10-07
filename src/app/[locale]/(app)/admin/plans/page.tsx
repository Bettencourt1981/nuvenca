import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requirePlatformAdmin } from "@/lib/admin";
import { getPlans } from "@/lib/data/drive";
import { ListSkeleton } from "@/components/drive/views";
import { AdminShell } from "@/components/admin/admin-shell";
import { PlanEditor } from "@/components/admin/plan-editor";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: `${t("tabs.plans")} · ${t("title")}` };
}

export default function AdminPlansPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Plans />
    </Suspense>
  );
}

const GB = 1024 ** 3;
const MB = 1024 ** 2;

async function Plans() {
  await requirePlatformAdmin();
  const plans = await getPlans();
  return (
    <AdminShell active="plans">
      <div className="max-w-4xl space-y-4">
        {plans.map((p) => (
          <PlanEditor
            key={p.id}
            plan={{
              id: p.id,
              name: p.name,
              storageGb: Math.round((p.storageQuotaBytes / GB) * 10) / 10,
              maxFileSizeMb: Math.round(p.maxFileSizeBytes / MB),
              maxMembers: p.maxMembers,
              trashDays: p.trashRetentionDays,
              historyDays: Number(p.features.version_history_days ?? 30),
              auditDays: Number(p.features.audit_log_days ?? 90),
              monthly: p.priceMonthlyCents === null ? null : p.priceMonthlyCents / 100,
              yearly: p.priceYearlyCents === null ? null : p.priceYearlyCents / 100,
              isPublic: p.isPublic,
              forKind: p.features.for === "personal" || p.features.for === "team" ? p.features.for : "",
              perSeat: p.features.per_seat === true,
            }}
          />
        ))}
      </div>
    </AdminShell>
  );
}
