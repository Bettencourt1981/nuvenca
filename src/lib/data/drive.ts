import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { FileItem, WorkspaceSummary } from "@/lib/types";
import { requireUser } from "@/lib/auth";

type DriveItemRow = Database["public"]["Views"]["drive_items"]["Row"];

const ITEM_COLUMNS =
  "id, workspace_id, parent_id, ancestor_ids, kind, name, mime_type, size_bytes, created_by, owner_name, created_at, updated_at, trashed_at, access_level, starred";

function toItem(row: Partial<DriveItemRow>): FileItem {
  return {
    id: row.id!,
    workspaceId: row.workspace_id!,
    parentId: row.parent_id ?? null,
    ancestorIds: row.ancestor_ids ?? [],
    kind: row.kind!,
    name: row.name!,
    mimeType: row.mime_type ?? null,
    sizeBytes: row.size_bytes ?? 0,
    createdBy: row.created_by ?? null,
    ownerName: row.owner_name ?? null,
    createdAt: row.created_at!,
    updatedAt: row.updated_at!,
    trashedAt: row.trashed_at ?? null,
    accessLevel: row.access_level ?? 0,
    starred: row.starred ?? false,
  };
}

function sortItems(items: FileItem[]): FileItem[] {
  return items.sort((a, b) =>
    a.kind === b.kind ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.kind === "folder" ? -1 : 1,
  );
}

/** Workspaces the current user belongs to, personal first. */
export const getWorkspaces = cache(async (): Promise<WorkspaceSummary[]> => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspaces")
    .select(
      "id, name, kind, plan_id, storage_used_bytes, plans(name, storage_quota_bytes, max_file_size_bytes, max_members, trash_retention_days), workspace_members!inner(role, user_id)",
    )
    .eq("workspace_members.user_id", user.id)
    .order("kind")
    .order("name");
  if (error) throw error;

  return (data ?? []).map((w) => ({
    id: w.id,
    name: w.name,
    kind: w.kind,
    role: w.workspace_members[0]?.role ?? "member",
    planId: w.plan_id,
    planName: w.plans?.name ?? w.plan_id,
    storageUsedBytes: w.storage_used_bytes,
    storageQuotaBytes: w.plans?.storage_quota_bytes ?? 0,
    maxFileSizeBytes: w.plans?.max_file_size_bytes ?? 0,
    maxMembers: w.plans?.max_members ?? 1,
    trashRetentionDays: w.plans?.trash_retention_days ?? 30,
  }));
});

export async function getPersonalWorkspace(): Promise<WorkspaceSummary> {
  const workspaces = await getWorkspaces();
  const personal = workspaces.find((w) => w.kind === "personal");
  if (!personal) throw new Error("Personal workspace missing");
  return personal;
}

export async function getWorkspace(id: string): Promise<WorkspaceSummary | null> {
  const workspaces = await getWorkspaces();
  return workspaces.find((w) => w.id === id) ?? null;
}

/** Children of a folder, or the root of a workspace when `parentId` is null. */
export async function listFolder(workspaceId: string, parentId: string | null): Promise<FileItem[]> {
  const supabase = await createClient();
  let query = supabase
    .from("drive_items")
    .select(ITEM_COLUMNS)
    .eq("in_trash", false)
    .eq("status", "ready");
  query = parentId ? query.eq("parent_id", parentId) : query.eq("workspace_id", workspaceId).is("parent_id", null);
  const { data, error } = await query.limit(1000);
  if (error) throw error;
  return sortItems((data ?? []).map(toItem));
}

export const getItem = cache(async (id: string): Promise<FileItem | null> => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("drive_items").select(ITEM_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toItem(data) : null;
});

/** The ancestor folders the user can see, root first. */
export async function getAncestors(item: FileItem): Promise<FileItem[]> {
  if (item.ancestorIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("drive_items").select(ITEM_COLUMNS).in("id", item.ancestorIds);
  if (error) throw error;
  const byId = new Map((data ?? []).map((row) => [row.id!, toItem(row)]));
  return item.ancestorIds.map((id) => byId.get(id)).filter((x): x is FileItem => Boolean(x));
}

async function itemsByIds(ids: string[]): Promise<FileItem[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("drive_items")
    .select(ITEM_COLUMNS)
    .in("id", ids)
    .eq("in_trash", false)
    .eq("status", "ready");
  if (error) throw error;
  return (data ?? []).map(toItem);
}

export async function listSharedWithMe(): Promise<FileItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("shared_with_me").select("id").limit(500);
  if (error) throw error;
  return sortItems(await itemsByIds((data ?? []).map((row) => row.id)));
}

export async function listRecent(): Promise<FileItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("drive_items")
    .select(ITEM_COLUMNS)
    .eq("kind", "file")
    .eq("in_trash", false)
    .eq("status", "ready")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map(toItem);
}

export async function listStarred(): Promise<FileItem[]> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("file_stars")
    .select("file_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return sortItems(await itemsByIds((data ?? []).map((row) => row.file_id)));
}

export async function listTrash(workspaceId: string): Promise<FileItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("drive_items")
    .select(ITEM_COLUMNS)
    .eq("workspace_id", workspaceId)
    .not("trashed_at", "is", null)
    .order("trashed_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return (data ?? []).map(toItem);
}

export type SearchResult = { items: FileItem[]; snippets: Record<string, string> };

/**
 * Names and contents of everything the user can open. Name matches come first;
 * `snippets` holds the matching passage for content matches.
 */
export async function searchItems(query: string): Promise<SearchResult> {
  const term = query.trim().slice(0, 100);
  if (!term) return { items: [], snippets: {} };
  const supabase = await createClient();
  const { data: matches, error } = await supabase.rpc("search_files", { p_query: term });
  if (error) throw error;
  if (!matches?.length) return { items: [], snippets: {} };

  const { data, error: itemsError } = await supabase
    .from("drive_items")
    .select(ITEM_COLUMNS)
    .in("id", matches.map((m) => m.file_id));
  if (itemsError) throw itemsError;
  const byId = new Map((data ?? []).map((row) => [row.id!, toItem(row)]));
  const items = matches.map((m) => byId.get(m.file_id)).filter((item): item is FileItem => Boolean(item));
  const snippets: Record<string, string> = {};
  for (const m of matches) if (m.snippet) snippets[m.file_id] = m.snippet;
  return { items, snippets };
}

export const getProfile = cache(async () => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, locale")
    .eq("id", user.id)
    .single();
  if (error) throw error;
  return { id: data.id, email: data.email, fullName: data.full_name, locale: data.locale };
});
