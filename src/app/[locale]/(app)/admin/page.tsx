import { Suspense } from "react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { requirePlatformAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlans } from "@/lib/data/drive";
import { formatBytes } from "@/lib/utils";
import { ListSkeleton } from "@/components/drive/views";
import { AdminShell } from "@/components/admin/admin-shell";
import { SignupsChart } from "@/components/admin/signups-chart";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: t("title") };
}

export default function AdminOverviewPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Overview />
    </Suspense>
  );
}

type OverviewData = {
  users: number;
  users_30d: number;
  active_7d: number;
  teams: number;
  files: number;
  native_files: number;
  storage_bytes: number;
  plans: Record<string, number>;
  subscriptions: Record<string, number>;
  signups: { day: string; count: number }[];
};

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {note ? <p className="mt-1 text-xs text-muted">{note}</p> : null}
    </div>
  );
}

async function Overview() {
  await requirePlatformAdmin();
  const [t, format, locale, plans] = await Promise.all([getTranslations("admin"), getFormatter(), getLocale(), getPlans()]);
  const { data, error } = await createAdminClient().rpc("admin_overview");
  if (error) throw error;
  const o = data as unknown as OverviewData;
  const paying = (o.subscriptions.active ?? 0) + (o.subscriptions.trialing ?? 0) + (o.subscriptions.past_due ?? 0);
  const compact = (n: number) => format.number(n, { notation: "compact", maximumFractionDigits: 1 });
  const totalWorkspaces = Object.values(o.plans).reduce((a, b) => a + b, 0) || 1;

  return (
    <AdminShell active="overview">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("stats.users")} value={compact(o.users)} note={t("stats.usersNew", { count: o.users_30d })} />
        <Stat label={t("stats.active")} value={compact(o.active_7d)} />
        <Stat label={t("stats.files")} value={compact(o.files)} note={t("stats.filesNative", { count: o.native_files })} />
        <Stat label={t("stats.storage")} value={formatBytes(o.storage_bytes, locale)} />
        <Stat label={t("stats.teams")} value={compact(o.teams)} />
        <Stat
          label={t("stats.paying")}
          value={compact(paying)}
          note={o.subscriptions.past_due ? t("stats.pastDue", { count: o.subscriptions.past_due }) : undefined}
        />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="rounded-2xl border border-border bg-surface p-5">
          <SignupsChart signups={o.signups} />
        </section>
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="mb-3 text-sm font-medium">{t("plansTitle")}</h2>
          <ul className="space-y-3">
            {plans.map((plan) => {
              const count = o.plans[plan.id] ?? 0;
              return (
                <li key={plan.id}>
                  <div className="flex justify-between text-sm">
                    <span>{plan.name}</span>
                    <span className="tabular-nums text-muted">{format.number(count)}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-hover">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(count / totalWorkspaces) * 100}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </AdminShell>
  );
}
