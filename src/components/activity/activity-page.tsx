import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getPlans } from "@/lib/data/drive";
import { listActivity } from "@/lib/data/activity";
import type { WorkspaceSummary } from "@/lib/types";
import { PageContainer, PageHeader } from "@/components/drive/views";
import { ActivityLog } from "./activity-log";

/** Activity of one workspace (owners and admins). */
export async function ActivityPage({ workspace, title, backHref }: { workspace: WorkspaceSummary; title: string; backHref: string }) {
  const [t, plans, initial] = await Promise.all([getTranslations("activity"), getPlans(), listActivity({ workspaceId: workspace.id })]);
  const plan = plans.find((p) => p.id === workspace.planId);
  const days = Number(plan?.features.audit_log_days ?? 90);
  return (
    <PageContainer>
      <PageHeader
        title={
          <span className="flex min-w-0 items-center gap-2">
            <Link href={backHref} className="rounded-lg p-2 text-muted hover:bg-surface-hover" aria-label={workspace.name}>
              <ArrowLeft className="size-5" />
            </Link>
            <span className="truncate">{title}</span>
          </span>
        }
      />
      <div className="max-w-3xl">
        <p className="mb-4 text-sm text-muted">{t("intro", { days })}</p>
        <ActivityLog workspaceId={workspace.id} initial={initial} planNames={Object.fromEntries(plans.map((p) => [p.id, p.name]))} />
      </div>
    </PageContainer>
  );
}
