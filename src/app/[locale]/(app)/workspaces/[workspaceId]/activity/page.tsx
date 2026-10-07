import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getWorkspace } from "@/lib/data/drive";
import { ListSkeleton } from "@/components/drive/views";
import { ActivityPage } from "@/components/activity/activity-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("activity");
  return { title: t("title") };
}

export default function TeamActivityPage({ params }: PageProps<"/[locale]/workspaces/[workspaceId]/activity">) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <TeamActivity params={params} />
    </Suspense>
  );
}

async function TeamActivity({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const [workspace, t] = await Promise.all([getWorkspace(workspaceId), getTranslations("activity")]);
  if (!workspace || workspace.kind !== "team" || (workspace.role !== "owner" && workspace.role !== "admin")) notFound();
  return <ActivityPage workspace={workspace} title={`${t("title")} · ${workspace.name}`} backHref={`/workspaces/${workspace.id}/settings`} />;
}
