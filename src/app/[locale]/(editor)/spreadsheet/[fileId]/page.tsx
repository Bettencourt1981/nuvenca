import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getItem } from "@/lib/data/drive";
import { loadEditorContext } from "@/lib/data/editor";
import { SpreadsheetEditor } from "@/components/editors/sheets/spreadsheet-editor";
import { EditorNotFound, EditorSkeleton } from "@/components/editors/editor-states";

export async function generateMetadata({ params }: PageProps<"/[locale]/spreadsheet/[fileId]">): Promise<Metadata> {
  const { fileId } = await params;
  const file = await getItem(fileId);
  return { title: file?.name ?? (await getTranslations("editor.sheets"))("untitled") };
}

export default function SpreadsheetPage({ params }: PageProps<"/[locale]/spreadsheet/[fileId]">) {
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <Spreadsheet params={params} />
    </Suspense>
  );
}

async function Spreadsheet({ params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const context = await loadEditorContext(fileId, "spreadsheet");
  if (!context) return <EditorNotFound />;
  return <SpreadsheetEditor {...context} />;
}
