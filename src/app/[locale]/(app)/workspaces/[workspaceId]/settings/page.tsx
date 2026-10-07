import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, History } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth";
import { getWorkspace } from "@/lib/data/drive";
import { ListSkeleton, PageContainer, PageHeader } from "@/components/drive/views";
import { Section } from "@/components/settings/section";
import { LinkRow } from "@/components/settings/link-row";
import { PlanSection } from "@/components/settings/plan-section";
import { StorageCard } from "@/components/settings/storage-card";
import { WorkspaceMembers } from "@/components/settings/workspace-members";
import { LeaveWorkspaceButton, WorkspaceRenameForm } from "@/components/settings/workspace-general";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("workspace");
  return { title: t("settings") };
}

export default function WorkspaceSettingsPage({ params }: PageProps<"/[locale]/workspaces/[workspaceId]/settings">) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <WorkspaceSettings params={params} />
    </Suspense>
  );
}

async function WorkspaceSettings({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const [user, workspace, t, settings, activity, billing] = await Promise.all([
    requireUser(),
    getWorkspace(workspaceId),
    getTranslations("workspace"),
    getTranslations("settings"),
    getTranslations("activity"),
    getTranslations("billing"),
  ]);
  if (!workspace || workspace.kind !== "team") notFound();
  const canManage = workspace.role === "owner" || workspace.role === "admin";

  return (
    <PageContainer>
      <PageHeader
        title={
          <span className="flex min-w-0 items-center gap-2">
            <Link
              href={`/workspaces/${workspace.id}`}
              className="rounded-lg p-2 text-muted hover:bg-surface-hover"
              aria-label={workspace.name}
            >
              <ArrowLeft className="size-5" />
            </Link>
            <span className="truncate">{workspace.name}</span>
          </span>
        }
      />
      <div className="max-w-2xl space-y-6">
        {canManage ? (
          <Section title={t("settings")}>
            <WorkspaceRenameForm workspaceId={workspace.id} name={workspace.name} />
          </Section>
        ) : null}
        <Section title={t("members")}>
          <WorkspaceMembers workspaceId={workspace.id} currentUserId={user.id} canManage={canManage} />
        </Section>
        <Section title={settings("storage")}>
          <StorageCard workspace={workspace} />
        </Section>
        {canManage ? (
          <Section title={billing("title")}>
            <PlanSection workspace={workspace} />
          </Section>
        ) : null}
        {canManage ? (
          <Section title={activity("title")}>
            <LinkRow href={`/workspaces/${workspace.id}/activity`} icon={<History />} label={activity("link")} />
          </Section>
        ) : null}
        {workspace.role !== "owner" ? (
          <div>
            <LeaveWorkspaceButton workspaceId={workspace.id} userId={user.id} />
          </div>
        ) : null}
      </div>
    </PageContainer>
  );
}
