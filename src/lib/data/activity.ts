import "server-only";
import { createClient } from "@/lib/supabase/server";

export type ActivityCategory = "all" | "files" | "downloads" | "sharing" | "team";

export type ActivityEvent = {
  id: number;
  createdAt: string;
  actorName: string | null;
  action: string;
  targetId: string | null;
  targetName: string | null;
  details: Record<string, unknown>;
};

export const ACTIVITY_PAGE_SIZE = 50;

/** Characters that would break a PostgREST `or` filter; harmless to drop from a search. */
const cleanQuery = (query: string) => query.replace(/[,()%*\\]/g, " ").trim().slice(0, 100);

/**
 * A page of a workspace's activity, newest first. RLS limits it to the
 * workspace's owners and admins.
 */
export async function listActivity(options: {
  workspaceId: string;
  category?: ActivityCategory;
  query?: string;
  before?: number;
  limit?: number;
}): Promise<{ events: ActivityEvent[]; hasMore: boolean }> {
  const limit = options.limit ?? ACTIVITY_PAGE_SIZE;
  const supabase = await createClient();
  let request = supabase
    .from("audit_events")
    .select("id, created_at, actor_name, action, target_id, target_name, details")
    .eq("workspace_id", options.workspaceId)
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (options.before) request = request.lt("id", options.before);
  switch (options.category) {
    case "files":
      request = request.like("action", "file.%").neq("action", "file.downloaded");
      break;
    case "downloads":
      request = request.eq("action", "file.downloaded");
      break;
    case "sharing":
      request = request.or("action.like.share.%,action.like.link.%");
      break;
    case "team":
      request = request.or("action.like.member.%,action.like.workspace.%,action.like.plan.%");
      break;
  }
  const query = cleanQuery(options.query ?? "");
  if (query) request = request.or(`target_name.ilike.%${query}%,actor_name.ilike.%${query}%`);
  const { data, error } = await request;
  if (error) throw error;
  const rows = data ?? [];
  return {
    hasMore: rows.length > limit,
    events: rows.slice(0, limit).map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      actorName: row.actor_name,
      action: row.action,
      targetId: row.target_id,
      targetName: row.target_name,
      details: (row.details ?? {}) as Record<string, unknown>,
    })),
  };
}
