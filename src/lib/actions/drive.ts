"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { nullableArg } from "@/lib/supabase/rpc";
import { STORAGE_BUCKET } from "@/lib/env";
import { errorCode, fail, ok, type ActionResult } from "@/lib/errors";

const id = z.string().uuid();
const ids = z.array(id).min(1).max(500);
const optionalId = id.nullable();

function invalid(): ActionResult<never> {
  return fail("generic");
}

/** Remove objects from Storage in batches (best effort; logged on failure). */
async function removeObjects(paths: string[]) {
  if (paths.length === 0) return;
  const admin = createAdminClient();
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await admin.storage.from(STORAGE_BUCKET).remove(paths.slice(i, i + 100));
    if (error) console.error("Failed to remove storage objects", error);
  }
}

// ---------------------------------------------------------------------------
// Folders, rename, move, trash
// ---------------------------------------------------------------------------

export async function createFolder(input: {
  workspaceId: string | null;
  parentId: string | null;
  name: string;
}): Promise<ActionResult<{ id: string }>> {
  const parsed = z
    .object({ workspaceId: optionalId, parentId: optionalId, name: z.string().max(255) })
    .safeParse(input);
  if (!parsed.success) return invalid();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_folder", {
    p_workspace_id: nullableArg(parsed.data.workspaceId),
    p_parent_id: nullableArg(parsed.data.parentId),
    p_name: parsed.data.name,
  });
  if (error) return fail(errorCode(error));
  refresh();
  return ok({ id: data.id });
}

export async function renameItem(input: { id: string; name: string }): Promise<ActionResult> {
  const parsed = z.object({ id, name: z.string().max(255) }).safeParse(input);
  if (!parsed.success) return invalid();
  const supabase = await createClient();
  const { error } = await supabase.rpc("rename_file", { p_file_id: parsed.data.id, p_name: parsed.data.name });
  if (error) return fail(errorCode(error));
  refresh();
  return ok(undefined);
}

export async function moveItems(input: { ids: string[]; targetParentId: string | null }): Promise<ActionResult<number>> {
  const parsed = z.object({ ids, targetParentId: optionalId }).safeParse(input);
  if (!parsed.success) return invalid();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("move_files", {
    p_file_ids: parsed.data.ids,
    p_target_parent_id: nullableArg(parsed.data.targetParentId),
  });
  if (error) return fail(errorCode(error));
  refresh();
  return ok(data);
}

export async function trashItems(input: { ids: string[] }): Promise<ActionResult<number>> {
  const parsed = z.object({ ids }).safeParse(input);
  if (!parsed.success) return invalid();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("trash_files", { p_file_ids: parsed.data.ids });
  if (error) return fail(errorCode(error));
  refresh();
  return ok(data);
}

export async function restoreItems(input: { ids: string[] }): Promise<ActionResult<number>> {
  const parsed = z.object({ ids }).safeParse(input);
  if (!parsed.success) return invalid();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("restore_files", { p_file_ids: parsed.data.ids });
  if (error) return fail(errorCode(error));
  refresh();
  return ok(data);
}

export async function deleteItemsForever(input: { ids: string[] }): Promise<ActionResult<number>> {
  const parsed = z.object({ ids }).safeParse(input);
  if (!parsed.success) return invalid();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_files_forever", { p_file_ids: parsed.data.ids });
  if (error) return fail(errorCode(error));
  await removeObjects(data ?? []);
  refresh();
  return ok(parsed.data.ids.length);
}

export async function emptyTrash(input: { workspaceId: string }): Promise<ActionResult> {
  const parsed = z.object({ workspaceId: id }).safeParse(input);
  if (!parsed.success) return invalid();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("empty_trash", { p_workspace_id: parsed.data.workspaceId });
  if (error) return fail(errorCode(error));
  await removeObjects(data ?? []);
  refresh();
  return ok(undefined);
}

export async function setStarred(input: { id: string; starred: boolean }): Promise<ActionResult> {
  const parsed = z.object({ id, starred: z.boolean() }).safeParse(input);
  if (!parsed.success) return invalid();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return fail("not_authenticated");

  const { error } = parsed.data.starred
    ? await supabase.from("file_stars").upsert({ user_id: userId, file_id: parsed.data.id }, { ignoreDuplicates: true })
    : await supabase.from("file_stars").delete().eq("user_id", userId).eq("file_id", parsed.data.id);
  if (error) return fail(errorCode(error));
  refresh();
  return ok(undefined);
}

/** Folders inside `parentId` (or a workspace root) for the "Move" picker. */
export async function listFolders(input: {
  workspaceId: string;
  parentId: string | null;
}): Promise<ActionResult<{ id: string; name: string; accessLevel: number }[]>> {
  const parsed = z.object({ workspaceId: id, parentId: optionalId }).safeParse(input);
  if (!parsed.success) return invalid();
  const supabase = await createClient();
  let query = supabase
    .from("drive_items")
    .select("id, name, access_level")
    .eq("kind", "folder")
    .eq("in_trash", false);
  query = parsed.data.parentId
    ? query.eq("parent_id", parsed.data.parentId)
    : query.eq("workspace_id", parsed.data.workspaceId).is("parent_id", null);
  const { data, error } = await query.order("name").limit(500);
  if (error) return fail(errorCode(error));
  return ok((data ?? []).map((f) => ({ id: f.id!, name: f.name!, accessLevel: f.access_level ?? 0 })));
}

// ---------------------------------------------------------------------------
// Uploads: the browser sends the bytes straight to Storage with a signed URL,
// so large files never pass through a Vercel function (4.5 MB body limit).
// ---------------------------------------------------------------------------

export async function startUpload(input: {
  workspaceId: string | null;
  parentId: string | null;
  name: string;
  size: number;
  type: string;
}): Promise<ActionResult<{ fileId: string; versionId: string; uploadUrl: string }>> {
  const parsed = z
    .object({
      workspaceId: optionalId,
      parentId: optionalId,
      name: z.string().min(1).max(255),
      size: z.number().int().nonnegative(),
      type: z.string().max(255),
    })
    .safeParse(input);
  if (!parsed.success) return invalid();

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("begin_upload", {
      p_workspace_id: nullableArg(parsed.data.workspaceId),
      p_parent_id: nullableArg(parsed.data.parentId),
      p_name: parsed.data.name,
      p_size_bytes: parsed.data.size,
      p_mime_type: parsed.data.type || "application/octet-stream",
    })
    .single();
  if (error || !data) return fail(errorCode(error));

  const admin = createAdminClient();
  const { data: signed, error: signError } = await admin.storage
    .from(STORAGE_BUCKET)
    .createSignedUploadUrl(data.storage_path);
  if (signError || !signed) {
    await supabase.rpc("cancel_upload", { p_file_id: data.file_id });
    return fail("upload_failed");
  }

  return ok({ fileId: data.file_id, versionId: data.version_id, uploadUrl: signed.signedUrl });
}

export async function finishUpload(input: { fileId: string; versionId: string }): Promise<ActionResult> {
  const parsed = z.object({ fileId: id, versionId: id }).safeParse(input);
  if (!parsed.success) return invalid();

  // Only the uploader may finish their own pending upload.
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const admin = createAdminClient();
  const { data: version } = await admin
    .from("file_versions")
    .select("id, storage_path, created_by, status, file_id")
    .eq("id", parsed.data.versionId)
    .eq("file_id", parsed.data.fileId)
    .maybeSingle();
  if (!version || !auth?.claims?.sub || version.created_by !== auth.claims.sub) return fail("not_found");

  // Trust the size Storage measured, not the size the browser announced.
  const { data: info, error: infoError } = await admin.storage.from(STORAGE_BUCKET).info(version.storage_path);
  if (infoError || !info) return fail("upload_failed");

  const { error } = await admin.rpc("complete_upload", {
    p_version_id: version.id,
    p_size_bytes: info.size ?? 0,
    p_mime_type: info.contentType ?? "",
  });
  if (error) {
    await admin.from("files").delete().eq("id", version.file_id);
    await removeObjects([version.storage_path]);
    return fail(errorCode(error));
  }
  refresh();
  return ok(undefined);
}

export async function cancelUpload(input: { fileId: string }): Promise<ActionResult> {
  const parsed = z.object({ fileId: id }).safeParse(input);
  if (!parsed.success) return invalid();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_upload", { p_file_id: parsed.data.fileId });
  if (error) return fail(errorCode(error));
  if (data) await removeObjects([data]);
  return ok(undefined);
}
