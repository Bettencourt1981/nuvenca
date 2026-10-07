"use client";

import * as Y from "yjs";
import { generateJSON, getSchema } from "@tiptap/core";
import { prosemirrorJSONToYDoc } from "@tiptap/y-tiptap";
import { createClient } from "@/lib/supabase/client";
import { compactDocument, createNativeFile } from "@/lib/actions/documents";
import { trashItems } from "@/lib/actions/drive";
import { toBase64 } from "@/lib/collab/base64";
import { documentExtensions } from "./docs/extensions";
import { docxToHtml } from "./docs/import-docx";
import { uploadDocumentImage } from "./docs/assets";
import { DOCUMENT_FIELD, EMPTY_YJS_STATE_BASE64, type NativeType } from "./native";
import { csvToDoc, xlsxToDoc } from "./sheets/import-xlsx";
import { nativeText } from "./text";

/**
 * Create a Nuvenca document or spreadsheet from a Word/Excel/CSV file, without
 * opening the editor (used for Google Drive imports).
 *
 * The file is created empty first (embedded images need its id), then the
 * converted content is appended straight to Supabase like an editor's save,
 * so large files never pass through a Vercel function.
 */
export async function importAsNativeFile(options: {
  data: ArrayBuffer;
  type: NativeType;
  name: string;
  workspaceId: string | null;
  parentId: string | null;
  locale: string;
  /** Sheet name for CSV files ("Sheet1" / "Folha1"). */
  sheetName: string;
}): Promise<{ id: string } | { error: string }> {
  const created = await createNativeFile({
    workspaceId: options.workspaceId,
    parentId: options.parentId,
    name: options.name,
    type: options.type,
    state: EMPTY_YJS_STATE_BASE64,
  });
  if (!created.ok) return { error: created.error };
  const fileId = created.data.id;

  try {
    let doc: Y.Doc;
    if (options.type === "document") {
      const html = await docxToHtml(options.data, (image) => uploadDocumentImage(fileId, image));
      const extensions = documentExtensions();
      doc = prosemirrorJSONToYDoc(getSchema(extensions), generateJSON(html, extensions), DOCUMENT_FIELD);
    } else {
      const bytes = new Uint8Array(options.data.slice(0, 2));
      const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
      doc = isZip ? await xlsxToDoc(options.data, options.locale) : csvToDoc(new TextDecoder().decode(options.data), options.sheetName, options.locale);
    }
    const supabase = createClient();
    const { error } = await supabase.rpc("append_document_update", {
      p_file_id: fileId,
      p_payload: toBase64(Y.encodeStateAsUpdate(doc)),
    });
    if (error) throw new Error(error.message);
    await supabase.rpc("set_file_content", { p_file_id: fileId, p_content: nativeText(doc, options.type) });
    doc.destroy();
    // Fold the content into the stored state now, so size and quota are right.
    await compactDocument({ fileId });
    return { id: fileId };
  } catch (error) {
    // Don't leave an empty file behind.
    await trashItems({ ids: [fileId] });
    return { error: error instanceof Error && /^[a-z_]+$/.test(error.message) ? error.message : "import_failed" };
  }
}
