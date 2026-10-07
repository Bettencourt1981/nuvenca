import { Suspense } from "react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { requirePlatformAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatBytes } from "@/lib/utils";
import { ListSkeleton } from "@/components/drive/views";
import { AdminShell, Pager, SearchForm } from "@/components/admin/admin-shell";

const PAGE_SIZE = 50;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: `${t("tabs.users")} · ${t("title")}` };
}

export default function AdminUsersPage({ searchParams }: PageProps<"/[locale]/admin/users">) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Users searchParams={searchParams} />
    </Suspense>
  );
}

async function Users({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePlatformAdmin();
  const params = await searchParams;
  const query = String(params.q ?? "").slice(0, 100);
  const page = Math.max(0, Number(params.page ?? 0) || 0);
  const [t, format, locale] = await Promise.all([getTranslations("admin"), getFormatter(), getLocale()]);
  const { data, error } = await createAdminClient().rpc("admin_list_users", {
    p_query: query,
    p_limit: PAGE_SIZE,
    p_offset: page * PAGE_SIZE,
  });
  if (error) throw error;
  const rows = data ?? [];
  const href = (p: number) => `/admin/users?${new URLSearchParams({ q: query, page: String(p) })}`;

  return (
    <AdminShell active="users">
      <SearchForm action="/admin/users" query={query} placeholder={t("searchUsers")} />
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">{t("columns.name")}</th>
              <th className="px-3 py-2 font-medium">{t("columns.created")}</th>
              <th className="px-3 py-2 font-medium">{t("columns.lastSignIn")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("columns.teams")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("columns.storage")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((u) => (
              <tr key={u.id}>
                <td className="px-3 py-2">
                  <span className="block font-medium">{u.full_name || u.email}</span>
                  <span className="text-xs text-muted">
                    {u.email}
                    {u.confirmed ? "" : ` · ${t("unconfirmed")}`}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted">{format.dateTime(new Date(u.created_at), { dateStyle: "medium" })}</td>
                <td className="px-3 py-2 text-muted">
                  {u.last_sign_in_at ? format.dateTime(new Date(u.last_sign_in_at), { dateStyle: "medium", timeStyle: "short" }) : t("never")}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{format.number(u.teams)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatBytes(u.storage_used_bytes, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager href={href} page={page} total={Number(rows[0]?.total ?? 0)} pageSize={PAGE_SIZE} />
    </AdminShell>
  );
}
