import "server-only";
import * as Y from "yjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { STORAGE_BUCKET } from "@/lib/env";
import { fromBase64 } from "@/lib/collab/base64";
import { nativeText } from "@/lib/editors/text";
import type { NativeType } from "@/lib/editors/native";
import { MAX_EXTRACT_BYTES, extractText, extractableKind } from "./extract-text";

/**
 * Index an uploaded file's text so search finds what is inside it. Runs after
 * the upload response (`after()`), with the secret key: the caller's access
 * was checked when the upload was finished. Failures only cost searchability.
 */
export async function indexUploadedFile(input: { fileId: string; storagePath: string; sizeBytes: number }) {
  try {
    if (input.sizeBytes > MAX_EXTRACT_BYTES) return;
    const admin = createAdminClient();
    const { data: file } = await admin.from("files").select("name, mime_type").eq("id", input.fileId).maybeSingle();
    if (!file) return;
    const kind = extractableKind(file.name, file.mime_type);
    if (!kind) return;
    const { data: blob, error } = await admin.storage.from(STORAGE_BUCKET).download(input.storagePath);
    if (error || !blob) return;
    const text = await extractText(Buffer.from(await blob.arrayBuffer()), kind);
    if (!text) return;
    const { error: indexError } = await admin.rpc("set_file_content", { p_file_id: input.fileId, p_content: text });
    if (indexError) console.warn("Indexing failed", input.fileId, indexError.message);
  } catch (error) {
    console.warn("Could not extract text for search", input.fileId, error instanceof Error ? error.message : error);
  }
}

/** Index a native file created with content (imports), as the signed-in editor. */
export async function indexNativeState(
  supabase: SupabaseClient<Database>,
  fileId: string,
  type: NativeType,
  stateBase64: string,
) {
  try {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, fromBase64(stateBase64));
    const text = nativeText(doc, type);
    doc.destroy();
    if (text) await supabase.rpc("set_file_content", { p_file_id: fileId, p_content: text });
  } catch (error) {
    console.warn("Could not index new file", fileId, error instanceof Error ? error.message : error);
  }
}
