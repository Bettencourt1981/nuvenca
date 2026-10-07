"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/env";
import { errorCode, fail, ok, type ActionResult } from "@/lib/errors";
import type { ShareRole } from "@/lib/types";

const id = z.string().uuid();
const role = z.enum(["viewer", "commenter", "editor"]);

export type AccessEntry = {
  shareId: string;
  email: string;
  userId: string | null;
  fullName: string | null;
  role: ShareRole;
  inherited: boolean;
  pending: boolean;
};

export type ShareSettings = {
  canManage: boolean;
  owner: { name: string | null } | null;
  people: AccessEntry[];
  link: { enabled: boolean; role: ShareRole; url: string } | null;
};

export async function getShareSettings(input: { fileId: string }): Promise<ActionResult<ShareSettings>> {
  const parsed = z.object({ fileId: id }).safeParse(input);
  if (!parsed.success) return fail("generic");
  const supabase = await createClient();

  const [{ data: item, error: itemError }, { data: people, error: peopleError }] = await Promise.all([
    supabase.from("drive_items").select("access_level, owner_name").eq("id", parsed.data.fileId).maybeSingle(),
    supabase.rpc("get_file_access_list", { p_file_id: parsed.data.fileId }),
  ]);
  if (itemError || peopleError) return fail(errorCode(itemError ?? peopleError));
  if (!item) return fail("not_found");

  const canManage = (item.access_level ?? 0) >= 3;
  let link: ShareSettings["link"] = null;
  if (canManage) {
    const { data } = await supabase
      .from("share_links")
      .select("enabled, role, token")
      .eq("file_id", parsed.data.fileId)
      .maybeSingle();
    if (data) link = { enabled: data.enabled, role: data.role, url: `${siteUrl()}/s/${data.token}` };
  }

  return ok({
    canManage,
    owner: { name: item.owner_name },
    people: (people ?? []).map((p) => ({
      shareId: p.share_id,
      email: p.email,
      userId: p.user_id,
      fullName: p.full_name,
      role: p.role,
      inherited: p.inherited_from !== null,
      pending: p.is_pending,
    })),
    link,
  });
}

export async function shareWithEmail(input: {
  fileId: string;
  email: string;
  role: ShareRole;
}): Promise<ActionResult> {
  const parsed = z.object({ fileId: id, email: z.string().trim().max(320), role }).safeParse(input);
  if (!parsed.success) return fail("invalid_email");
  const supabase = await createClient();
  const { error } = await supabase.rpc("share_file", {
    p_file_id: parsed.data.fileId,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
  });
  if (error) return fail(errorCode(error));
  refresh();
  return ok(undefined);
}

export async function updateShareRole(input: { shareId: string; role: ShareRole }): Promise<ActionResult> {
  const parsed = z.object({ shareId: id, role }).safeParse(input);
  if (!parsed.success) return fail("generic");
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_share", { p_share_id: parsed.data.shareId, p_role: parsed.data.role });
  if (error) return fail(errorCode(error));
  return ok(undefined);
}

export async function removeShare(input: { shareId: string }): Promise<ActionResult> {
  const parsed = z.object({ shareId: id }).safeParse(input);
  if (!parsed.success) return fail("generic");
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_share", { p_share_id: parsed.data.shareId });
  if (error) return fail(errorCode(error));
  refresh();
  return ok(undefined);
}

export async function setLinkSharing(input: {
  fileId: string;
  enabled: boolean;
  role: ShareRole;
}): Promise<ActionResult<{ enabled: boolean; role: ShareRole; url: string }>> {
  const parsed = z.object({ fileId: id, enabled: z.boolean(), role }).safeParse(input);
  if (!parsed.success) return fail("generic");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_share_link", {
    p_file_id: parsed.data.fileId,
    p_enabled: parsed.data.enabled,
    p_role: parsed.data.role,
  });
  if (error) return fail(errorCode(error));
  return ok({ enabled: data.enabled, role: data.role, url: `${siteUrl()}/s/${data.token}` });
}
