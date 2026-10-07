"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import * as Y from "yjs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { nullableArg } from "@/lib/supabase/rpc";
import { STORAGE_BUCKET } from "@/lib/env";
import { errorCode, fail, ok, type ActionResult } from "@/lib/errors";
import { fromBase64, toBase64 } from "@/lib/collab/base64";
import { EMPTY_YJS_STATE_BASE64, importableAs, stripExtension } from "@/lib/editors/native";

const id = z.string().uuid();

/** Create a native document or spreadsheet, optionally with initial content. */
export async function createNativeFile(input: {
  workspaceId: string | null;
  parentId: string | null;
  name: string;
  type: "document" | "spreadsheet";
  state?: string;
}): Promise<ActionResult<{ id: string }>> {
  const parsed = z
    .object({
      workspaceId: id.nullable(),
      parentId: id.nullable(),
      name: z.string().min(1).max(255),
      type: z.enum(["document", "spreadsheet"]),
      state: z.string().max(40_000_000).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return fail("generic");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_native_file", {
    p_workspace_id: nullableArg(parsed.data.workspaceId),
    p_parent_id: nullableArg(parsed.data.parentId),
    p_name: parsed.data.name,
    p_type: parsed.data.type,
    p_state: parsed.data.state ?? EMPTY_YJS_STATE_BASE64,
  });
  if (error) return fail(errorCode(error));
  refresh();
  return ok({ id: data.id });
}

/**
 * Fold the pending updates into the stored state. Yjs merging runs here (in
 * Node); the database applies the result only if nobody compacted meanwhile.
 */
export async function compactDocument(input: { fileId: string }): Promise<ActionResult<{ compacted: boolean }>> {
  const parsed = z.object({ fileId: id }).safeParse(input);
  if (!parsed.success) return fail("generic");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("load_document", { p_file_id: parsed.data.fileId });
  if (error || !data) return fail(errorCode(error));
  const loaded = data as unknown as {
    access_level: number;
    revision: number;
    state: string;
    updates: { id: number; payload: string }[];
  };
  if (loaded.access_level < 3) return fail("forbidden");
  if (loaded.updates.length === 0) return ok({ compacted: false });

  const merged = Y.mergeUpdates([fromBase64(loaded.state), ...loaded.updates.map((u) => fromBase64(u.payload))]);
  const admin = createAdminClient();
  const { data: applied, error: compactError } = await admin.rpc("compact_document", {
    p_file_id: parsed.data.fileId,
    p_state: toBase64(merged),
    p_expected_revision: loaded.revision,
    p_last_update_id: loaded.updates[loaded.updates.length - 1].id,
  });
  if (compactError) return fail(errorCode(compactError));
  return ok({ compacted: Boolean(applied) });
}

// ---------------------------------------------------------------------------
// Images embedded in documents
// ---------------------------------------------------------------------------

export async function startAssetUpload(input: {
  fileId: string;
  size: number;
  type: string;
}): Promise<ActionResult<{ assetId: string; uploadUrl: string; src: string }>> {
  const parsed = z
    .object({ fileId: id, size: z.number().int().positive(), type: z.string().max(100) })
    .safeParse(input);
  if (!parsed.success) return fail("generic");

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("begin_asset_upload", {
      p_file_id: parsed.data.fileId,
      p_size_bytes: parsed.data.size,
      p_mime_type: parsed.data.type,
    })
    .single();
  if (error || !data) return fail(errorCode(error));

  const admin = createAdminClient();
  const { data: signed, error: signError } = await admin.storage
    .from(STORAGE_BUCKET)
    .createSignedUploadUrl(data.storage_path);
  if (signError || !signed) return fail("upload_failed");
  return ok({ assetId: data.asset_id, uploadUrl: signed.signedUrl, src: `/api/assets/${data.asset_id}` });
}

export async function finishAssetUpload(input: { assetId: string }): Promise<ActionResult> {
  const parsed = z.object({ assetId: id }).safeParse(input);
  if (!parsed.success) return fail("generic");

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const admin = createAdminClient();
  const { data: asset } = await admin
    .from("document_assets")
    .select("id, storage_path, created_by")
    .eq("id", parsed.data.assetId)
    .maybeSingle();
  if (!asset || !auth?.claims?.sub || asset.created_by !== auth.claims.sub) return fail("not_found");

  const { data: info, error: infoError } = await admin.storage.from(STORAGE_BUCKET).info(asset.storage_path);
  if (infoError || !info) return fail("upload_failed");
  const { error } = await admin.rpc("complete_asset_upload", { p_asset_id: asset.id, p_size_bytes: info.size ?? 0 });
  if (error) {
    await admin.storage.from(STORAGE_BUCKET).remove([asset.storage_path]);
    await admin.from("document_assets").delete().eq("id", asset.id);
    return fail(errorCode(error));
  }
  return ok(undefined);
}

/**
 * "Open with Nuvenca Docs/Sheets": create an empty native file next to the
 * uploaded one (or in "My files" if the user can't add files there). The
 * editor then converts the original in the browser (?import=<sourceId>).
 */
export async function createImportTarget(input: { sourceId: string }): Promise<
  ActionResult<{ id: string; type: "document" | "spreadsheet" }>
> {
  const parsed = z.object({ sourceId: id }).safeParse(input);
  if (!parsed.success) return fail("generic");
  const supabase = await createClient();
  const { data: source } = await supabase
    .from("drive_items")
    .select("id, name, mime_type, workspace_id, parent_id, access_level")
    .eq("id", parsed.data.sourceId)
    .maybeSingle();
  if (!source) return fail("not_found");
  const type = importableAs(source.name!, source.mime_type);
  if (!type) return fail("invalid_type");

  let location = { workspaceId: source.workspace_id as string | null, parentId: source.parent_id };
  if ((source.access_level ?? 0) < 3) {
    const { data: auth } = await supabase.auth.getClaims();
    const { data: personal } = await supabase
      .from("workspaces")
      .select("id")
      .eq("kind", "personal")
      .eq("owner_id", auth?.claims?.sub ?? "")
      .maybeSingle();
    location = { workspaceId: personal?.id ?? null, parentId: null };
  }
  const created = await createNativeFile({ ...location, name: stripExtension(source.name!), type });
  if (!created.ok) return created;
  return ok({ id: created.data.id, type });
}

/** Join a file through an edit/comment link, then open it in the editor. */
export async function joinViaLink(input: { token: string }): Promise<ActionResult<{ href: string }>> {
  const parsed = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/) }).safeParse(input);
  if (!parsed.success) return fail("not_found");
  const supabase = await createClient();
  const { data: fileId, error } = await supabase.rpc("join_via_link", { p_token: parsed.data.token });
  if (error || !fileId) return fail(errorCode(error));
  const { data: file } = await supabase.from("files").select("mime_type").eq("id", fileId).single();
  const type = file?.mime_type === "application/vnd.nuvenca.spreadsheet" ? "spreadsheet" : "document";
  return ok({ href: `/${type}/${fileId}` });
}
