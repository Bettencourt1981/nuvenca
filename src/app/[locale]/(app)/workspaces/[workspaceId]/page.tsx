import { Suspense } from "react";
import type { Metadata } from "next";
import { getWorkspace } from "@/lib/data/drive";
import { FolderView, ListSkeleton } from "@/components/drive/views";

export async function generateMetadata({ params }: PageProps<"/[locale]/workspaces/[workspaceId]">): Promise<Metadata> {
  const { workspaceId } = await params;
  const workspace = await getWorkspace(workspaceId);
  return { title: workspace?.name };
}

export default function WorkspacePage({ params }: PageProps<"/[locale]/workspaces/[workspaceId]">) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <WorkspaceRoot params={params} />
    </Suspense>
  );
}

async function WorkspaceRoot({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  return <FolderView workspaceId={workspaceId} />;
}
