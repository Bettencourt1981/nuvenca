import type { Database } from "@/lib/supabase/database.types";

export type ShareRole = Database["public"]["Enums"]["share_role"];
export type WorkspaceRole = Database["public"]["Enums"]["workspace_role"];

/** Access levels, matching `file_access_level` in the database. */
export const ACCESS = { none: 0, viewer: 1, commenter: 2, editor: 3, manager: 4 } as const;

export type FileItem = {
  id: string;
  workspaceId: string;
  parentId: string | null;
  ancestorIds: string[];
  kind: "folder" | "file";
  name: string;
  mimeType: string | null;
  sizeBytes: number;
  createdBy: string | null;
  ownerName: string | null;
  createdAt: string;
  updatedAt: string;
  trashedAt: string | null;
  accessLevel: number;
  starred: boolean;
};

export type WorkspaceSummary = {
  id: string;
  name: string;
  kind: "personal" | "team";
  role: WorkspaceRole;
  planId: string;
  planName: string;
  storageUsedBytes: number;
  storageQuotaBytes: number;
  maxFileSizeBytes: number;
  maxMembers: number;
  trashRetentionDays: number;
};

export type CurrentUser = { id: string; email: string };
