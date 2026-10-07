import { Suspense } from "react";
import type { Metadata } from "next";
import { getItem } from "@/lib/data/drive";
import { FolderView, ListSkeleton } from "@/components/drive/views";

export async function generateMetadata({ params }: PageProps<"/[locale]/drive/folders/[folderId]">): Promise<Metadata> {
  const { folderId } = await params;
  const folder = await getItem(folderId);
  return { title: folder?.name };
}

export default function FolderPage({ params }: PageProps<"/[locale]/drive/folders/[folderId]">) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Folder params={params} />
    </Suspense>
  );
}

async function Folder({ params }: { params: Promise<{ folderId: string }> }) {
  const { folderId } = await params;
  return <FolderView folderId={folderId} />;
}
