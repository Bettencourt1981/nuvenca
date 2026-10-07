import "server-only";
import { connection } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ShareRole } from "@/lib/types";

export type PublicItem = {
  id: string;
  name: string;
  kind: "folder" | "file";
  mimeType: string | null;
  sizeBytes: number;
  updatedAt: string;
  ancestorIds: string[];
  currentVersionId: string | null;
};

export type ResolvedShare = {
  role: ShareRole;
  root: PublicItem;
  item: PublicItem;
  /** Folders between the shared root and `item` (inclusive of root), for breadcrumbs. */
  trail: PublicItem[];
};

const COLUMNS = "id, name, kind, mime_type, size_bytes, updated_at, ancestor_ids, current_version_id, in_trash, status";

type Row = {
  id: string;
  name: string;
  kind: "folder" | "file";
  mime_type: string | null;
  size_bytes: number;
  updated_at: string;
  ancestor_ids: string[];
  current_version_id: string | null;
  in_trash: boolean;
  status: "uploading" | "ready";
};

const toItem = (row: Row): PublicItem => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
  mimeType: row.mime_type,
  sizeBytes: row.size_bytes,
  updatedAt: row.updated_at,
  ancestorIds: row.ancestor_ids,
  currentVersionId: row.current_version_id,
});

/**
 * Resolve an "anyone with the link" token, optionally to an item inside a
 * shared folder. Returns null when the link is off, expired, or the item is
 * not inside what was shared. Uses the admin client: the link itself is the
 * authorisation.
 */
export async function resolveShare(token: string, itemId?: string | null): Promise<ResolvedShare | null> {
  // Link expiry depends on the current time: resolve at request time only.
  await connection();
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const admin = createAdminClient();

  const { data: link } = await admin
    .from("share_links")
    .select("file_id, role, enabled, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!link || !link.enabled || (link.expires_at && new Date(link.expires_at) < new Date())) return null;

  const { data: rootRow } = await admin.from("files").select(COLUMNS).eq("id", link.file_id).maybeSingle<Row>();
  if (!rootRow || rootRow.in_trash || rootRow.status !== "ready") return null;
  const root = toItem(rootRow);

  if (!itemId || itemId === root.id) return { role: link.role, root, item: root, trail: [root] };
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) return null;

  const { data: row } = await admin.from("files").select(COLUMNS).eq("id", itemId).maybeSingle<Row>();
  if (!row || row.in_trash || row.status !== "ready" || !row.ancestor_ids.includes(root.id)) return null;
  const item = toItem(row);

  const between = item.ancestorIds.slice(item.ancestorIds.indexOf(root.id) + 1);
  const { data: trailRows } = between.length
    ? await admin.from("files").select(COLUMNS).in("id", between).returns<Row[]>()
    : { data: [] as Row[] };
  const byId = new Map((trailRows ?? []).map((r) => [r.id, toItem(r)]));
  const trail = [root, ...between.map((id) => byId.get(id)).filter((x): x is PublicItem => Boolean(x))];
  if (item.kind === "folder") trail.push(item);

  return { role: link.role, root, item, trail };
}

export async function listPublicFolder(folderId: string): Promise<PublicItem[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("files")
    .select(COLUMNS)
    .eq("parent_id", folderId)
    .eq("in_trash", false)
    .eq("status", "ready")
    .order("kind", { ascending: false })
    .order("name")
    .limit(1000)
    .returns<Row[]>();
  return (data ?? []).map(toItem);
}
