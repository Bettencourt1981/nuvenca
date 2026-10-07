import { getLocale, getTranslations } from "next-intl/server";
import { cn, formatBytes } from "@/lib/utils";
import type { WorkspaceSummary } from "@/lib/types";

export async function StorageCard({ workspace }: { workspace: WorkspaceSummary }) {
  const [t, nav, locale] = await Promise.all([getTranslations("settings"), getTranslations("nav"), getLocale()]);
  const usage = Math.min(1, workspace.storageUsedBytes / Math.max(1, workspace.storageQuotaBytes));
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-medium">{t("planName", { plan: workspace.planName })}</span>
        <span className="text-sm text-muted">
          {nav("storageUsed", {
            used: formatBytes(workspace.storageUsedBytes, locale),
            total: formatBytes(workspace.storageQuotaBytes, locale),
          })}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-hover">
        <div
          className={cn("h-full rounded-full", usage > 0.9 ? "bg-danger" : "bg-primary")}
          style={{ width: `${Math.max(usage * 100, usage > 0 ? 1 : 0)}%` }}
        />
      </div>
      <p className="text-sm text-muted">{t("maxFileSize", { size: formatBytes(workspace.maxFileSizeBytes, locale) })}</p>
    </div>
  );
}
