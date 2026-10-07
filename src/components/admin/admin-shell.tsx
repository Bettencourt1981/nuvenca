import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { PageContainer, PageHeader } from "@/components/drive/views";

const TABS = [
  { key: "overview", href: "/admin" },
  { key: "workspaces", href: "/admin/workspaces" },
  { key: "users", href: "/admin/users" },
  { key: "plans", href: "/admin/plans" },
] as const;

export async function AdminShell({ active, children }: { active: (typeof TABS)[number]["key"]; children: ReactNode }) {
  const t = await getTranslations("admin");
  return (
    <PageContainer>
      <PageHeader title={t("title")} />
      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-border" aria-label={t("title")}>
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active === tab.key ? "page" : undefined}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm",
              active === tab.key ? "border-primary font-medium text-primary" : "border-transparent text-muted hover:text-foreground",
            )}
          >
            {t(`tabs.${tab.key}`)}
          </Link>
        ))}
      </nav>
      {children}
    </PageContainer>
  );
}

/** Previous/next links for paged admin tables. */
export async function Pager({ href, page, total, pageSize }: { href: (page: number) => string; page: number; total: number; pageSize: number }) {
  const t = await getTranslations("admin");
  const last = Math.max(0, Math.ceil(total / pageSize) - 1);
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-muted">
      <span>{t("results", { count: total })}</span>
      <span className="flex gap-2">
        {page > 0 ? (
          <Link href={href(page - 1)} className="rounded-lg border border-border px-3 py-1.5 hover:bg-surface-hover">
            {t("previous")}
          </Link>
        ) : null}
        {page < last ? (
          <Link href={href(page + 1)} className="rounded-lg border border-border px-3 py-1.5 hover:bg-surface-hover">
            {t("next")}
          </Link>
        ) : null}
      </span>
    </div>
  );
}

/** A GET search box (keeps the query in the URL). */
export async function SearchForm({ action, query, placeholder }: { action: string; query: string; placeholder: string }) {
  const t = await getTranslations("admin");
  return (
    <form action={action} className="mb-4 flex gap-2" role="search">
      <input
        type="search"
        name="q"
        defaultValue={query}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none"
      />
      <button type="submit" className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover">
        {t("search")}
      </button>
    </form>
  );
}
