import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getPersonalWorkspace } from "@/lib/data/drive";
import { FolderView, ListSkeleton } from "@/components/drive/views";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("myDrive") };
}

export default function DrivePage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <PersonalRoot />
    </Suspense>
  );
}

async function PersonalRoot() {
  const workspace = await getPersonalWorkspace();
  return <FolderView workspaceId={workspace.id} />;
}
