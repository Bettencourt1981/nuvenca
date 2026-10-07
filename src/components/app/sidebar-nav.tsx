"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Clock, HardDrive, Plus, Star, Trash2, Users, UsersRound } from "lucide-react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { createTeamWorkspace } from "@/lib/actions/workspace";
import { useErrorMessage } from "@/hooks/use-error-message";
import { NameDialog } from "@/components/drive/name-dialog";
import { cn, formatBytes } from "@/lib/utils";
import type { WorkspaceSummary } from "@/lib/types";

export function SidebarNav({
  workspaces,
  onNavigate,
}: {
  workspaces: WorkspaceSummary[];
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav");
  const ws = useTranslations("workspace");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const message = useErrorMessage();
  const [createOpen, setCreateOpen] = useState(false);

  const personal = workspaces.find((w) => w.kind === "personal");
  const teams = workspaces.filter((w) => w.kind === "team");

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const linkClass = (active: boolean) =>
    cn(
      "flex items-center gap-3 rounded-full px-4 py-2 text-sm transition-colors",
      active ? "bg-primary-soft font-medium text-primary" : "text-foreground hover:bg-surface-hover",
    );

  const primary = [
    { href: "/drive", label: t("myDrive"), icon: HardDrive },
    { href: "/shared", label: t("sharedWithMe"), icon: Users },
    { href: "/recent", label: t("recent"), icon: Clock },
    { href: "/starred", label: t("starred"), icon: Star },
    { href: "/trash", label: t("trash"), icon: Trash2 },
  ];

  const usage = personal ? Math.min(1, personal.storageUsedBytes / Math.max(1, personal.storageQuotaBytes)) : 0;

  return (
    <nav className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-4" aria-label={t("myDrive")}>
      <ul className="space-y-0.5">
        {primary.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              className={linkClass(href === "/drive" ? pathname === "/drive" || pathname.startsWith("/drive/") : isActive(href))}
            >
              <Icon className="size-[18px]" aria-hidden />
              {label}
            </Link>
          </li>
        ))}
      </ul>

      <div>
        <div className="mb-1 flex items-center justify-between pl-4 pr-1">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{t("teamWorkspaces")}</h2>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="rounded-lg p-1 text-muted hover:bg-surface-hover hover:text-foreground"
            aria-label={t("newTeamWorkspace")}
            title={t("newTeamWorkspace")}
          >
            <Plus className="size-4" />
          </button>
        </div>
        <ul className="space-y-0.5">
          {teams.map((team) => (
            <li key={team.id}>
              <Link href={`/workspaces/${team.id}`} onClick={onNavigate} className={linkClass(isActive(`/workspaces/${team.id}`))}>
                <UsersRound className="size-[18px]" aria-hidden />
                <span className="truncate">{team.name}</span>
              </Link>
            </li>
          ))}
          {teams.length === 0 ? (
            <li>
              <button type="button" onClick={() => setCreateOpen(true)} className={cn(linkClass(false), "w-full text-muted")}>
                <Plus className="size-[18px]" aria-hidden />
                {t("newTeamWorkspace")}
              </button>
            </li>
          ) : null}
        </ul>
      </div>

      {personal ? (
        <Link href="/settings" onClick={onNavigate} className="mt-auto block rounded-xl px-4 py-3 hover:bg-surface-hover">
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-hover">
            <div
              className={cn("h-full rounded-full", usage > 0.9 ? "bg-danger" : "bg-primary")}
              style={{ width: `${Math.max(usage * 100, usage > 0 ? 2 : 0)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted">
            {t("storageUsed", {
              used: formatBytes(personal.storageUsedBytes, locale),
              total: formatBytes(personal.storageQuotaBytes, locale),
            })}
          </p>
        </Link>
      ) : null}

      {createOpen ? (
      <NameDialog
        open
        onOpenChange={setCreateOpen}
        title={ws("createTitle")}
        label={ws("name")}
        initialValue=""
        submitLabel={ws("createTitle")}
        onSubmit={async (name) => {
          const result = await createTeamWorkspace({ name });
          if (!result.ok) return message(result.error);
          toast.success(ws("created"));
          onNavigate?.();
          router.push(`/workspaces/${result.data.id}`);
          return null;
        }}
      />
      ) : null}
    </nav>
  );
}
