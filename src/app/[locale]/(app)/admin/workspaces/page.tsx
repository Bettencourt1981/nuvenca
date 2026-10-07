import { Suspense } from "react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { requirePlatformAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlans } from "@/lib/data/drive";
import { formatBytes } from "@/lib/utils";
import { ListSkeleton } from "@/components/drive/views";
import { AdminShell, Pager, SearchForm } from "@/components/admin/admin-shell";
import { SetPlan } from "@/components/admin/set-plan";

const PAGE_SIZE = 50;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: `${t("tabs.workspaces")} · ${t("title")}` };
}

export default function AdminWorkspacesPage({ searchParams }: PageProps<"/[locale]/admin/workspaces">) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Workspaces searchParams={searchParams} />
    </Suspense>
  );
}

async function Workspaces({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePlatformAdmin();
  const params = await searchParams;
  const query = String(params.q ?? "").slice(0, 100);
  const page = Math.max(0, Number(params.page ?? 0) || 0);
  const [t, format, locale, plans] = await Promise.all([getTranslations("admin"), getFormatter(), getLocale(), getPlans()]);
  const { data, error } = await createAdminClient().rpc("admin_list_workspaces", {
    p_query: query,
    p_limit: PAGE_SIZE,
    p_offset: page * PAGE_SIZE,
  });
  if (error) throw error;
  const rows = data ?? [];
  const href = (p: number) => `/admin/workspaces?${new URLSearchParams({ q: query, page: String(p) })}`;

  return (
    <AdminShell active="workspaces">
      <SearchForm action="/admin/workspaces" query={query} placeholder={t("searchWorkspaces")} />
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">{t("columns.name")}</th>
              <th className="px-3 py-2 font-medium">{t("columns.owner")}</th>
              <th className="px-3 py-2 font-medium">{t("columns.plan")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("columns.members")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("columns.storage")}</th>
              <th className="px-3 py-2 font-medium">{t("columns.created")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((w) => (
              <tr key={w.id} data-workspace={w.id}>
                <td className="px-3 py-2">
                  <span className="block font-medium">{w.name}</span>
                  <span className="text-xs text-muted">{w.kind === "team" ? t("team") : t("personal")}</span>
                </td>
                <td className="px-3 py-2">
                  <span className="block">{w.owner_name || w.owner_email}</span>
                  {w.owner_name ? <span className="text-xs text-muted">{w.owner_email}</span> : null}
                </td>
                <td className="px-3 py-2">
                  <SetPlan
                    workspaceId={w.id}
                    planId={w.plan_id}
                    plans={plans.map((p) => ({ id: p.id, name: p.name }))}
                    stripe={Boolean(w.subscription_status && w.subscription_status !== "canceled")}
                  />
                  {w.subscription_status ? <span className="mt-0.5 block text-xs text-muted">Stripe: {w.subscription_status}</span> : null}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{format.number(w.members)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatBytes(w.storage_used_bytes, locale)}
                  <span className="block text-xs text-muted">/ {formatBytes(w.storage_quota_bytes, locale)}</span>
                </td>
                <td className="px-3 py-2 text-muted">{format.dateTime(new Date(w.created_at), { dateStyle: "medium" })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager href={href} page={page} total={Number(rows[0]?.total ?? 0)} pageSize={PAGE_SIZE} />
    </AdminShell>
  );
}
