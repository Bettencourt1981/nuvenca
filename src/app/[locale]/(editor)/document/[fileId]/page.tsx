import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getItem } from "@/lib/data/drive";
import { loadEditorContext } from "@/lib/data/editor";
import { DocumentEditor } from "@/components/editors/docs/document-editor";
import { EditorNotFound, EditorSkeleton } from "@/components/editors/editor-states";

export async function generateMetadata({ params }: PageProps<"/[locale]/document/[fileId]">): Promise<Metadata> {
  const { fileId } = await params;
  const file = await getItem(fileId);
  return { title: file?.name ?? (await getTranslations("editor.docs"))("untitled") };
}

export default function DocumentPage({ params }: PageProps<"/[locale]/document/[fileId]">) {
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <Document params={params} />
    </Suspense>
  );
}

async function Document({ params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const context = await loadEditorContext(fileId, "document");
  if (!context) return <EditorNotFound />;
  return <DocumentEditor {...context} />;
}
