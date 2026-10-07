import "server-only";
import * as Y from "yjs";
import { yDocToProsemirrorJSON } from "@tiptap/y-tiptap";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fromBase64 } from "@/lib/collab/base64";
import { STORAGE_BUCKET } from "@/lib/env";
import { DOCUMENT_FIELD } from "@/lib/editors/docs/extensions";
import { documentToDocx } from "@/lib/editors/docs/export-docx";
import { exportExtension, type NativeType } from "@/lib/editors/native";

type Loaded = { state: string; updates: { payload: string }[] };

function merge(loaded: Loaded): Uint8Array {
  return Y.mergeUpdates([fromBase64(loaded.state), ...loaded.updates.map((u) => fromBase64(u.payload))]);
}

/** Current content of a native file, checked against the signed-in user's access. */
export async function loadStateAsUser(fileId: string): Promise<Uint8Array | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("load_document", { p_file_id: fileId });
  if (error || !data) return null;
  return merge(data as unknown as Loaded);
}

/** Current content without a user check (public links: the caller already authorised). */
export async function loadStateAsAdmin(fileId: string): Promise<Uint8Array | null> {
  const admin = createAdminClient();
  const [{ data: state }, { data: updates }] = await Promise.all([
    admin.from("document_states").select("state").eq("file_id", fileId).maybeSingle(),
    admin.from("document_updates").select("payload").eq("file_id", fileId).order("id"),
  ]);
  if (!state) return null;
  // bytea columns come back hex-encoded ("\x…") through the REST API.
  const bytes = (value: string) => new Uint8Array(Buffer.from(value.replace(/^\\x/, ""), "hex"));
  return Y.mergeUpdates([bytes(state.state as unknown as string), ...(updates ?? []).map((u) => bytes(u.payload as unknown as string))]);
}

const IMAGE_TYPES: Record<string, "png" | "jpg" | "gif" | "bmp"> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/bmp": "bmp",
};

/** Export a native file to its Office format. */
export async function exportNativeFile(
  fileId: string,
  type: NativeType,
  state: Uint8Array,
): Promise<{ data: Uint8Array; contentType: string; extension: string }> {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state);
  try {
    if (type === "document") {
      const admin = createAdminClient();
      const data = await documentToDocx(yDocToProsemirrorJSON(doc, DOCUMENT_FIELD) as never, async (src) => {
        const match = /^\/api\/assets\/([0-9a-f-]{36})/i.exec(src);
        if (!match) return null;
        const { data: asset } = await admin
          .from("document_assets")
          .select("storage_path, mime_type, file_id")
          .eq("id", match[1])
          .maybeSingle();
        const imageType = asset?.mime_type ? IMAGE_TYPES[asset.mime_type] : undefined;
        if (!asset || asset.file_id !== fileId || !imageType) return null;
        const { data: blob } = await admin.storage.from(STORAGE_BUCKET).download(asset.storage_path);
        return blob ? { data: new Uint8Array(await blob.arrayBuffer()), type: imageType } : null;
      });
      return {
        data,
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        extension: exportExtension(type),
      };
    }
    const { workbookToXlsx } = await import("@/lib/editors/sheets/export-xlsx");
    return {
      data: await workbookToXlsx(doc),
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      extension: exportExtension(type),
    };
  } finally {
    doc.destroy();
  }
}

export function attachmentHeader(name: string, extension: string) {
  const filename = `${name}.${extension}`;
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
