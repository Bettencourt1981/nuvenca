"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/env";
import { errorCode, fail, ok, type ActionResult } from "@/lib/errors";
import { itemHref } from "@/lib/links";
import { nativeType } from "@/lib/editors/native";
import { emailConfigured, sendEmail } from "@/lib/email/mailer";
import { fileSharedEmail } from "@/lib/email/templates";
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
  /** Whether people can be notified by email (SMTP is configured). */
  canNotify: boolean;
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
    canNotify: canManage && emailConfigured(),
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
  /** Email the person (default true when email is configured). */
  notify?: boolean;
  message?: string;
  /** The sharer's interface language (used when the recipient has none yet). */
  locale?: string;
}): Promise<ActionResult<{ notified: boolean; limited: boolean }>> {
  const parsed = z
    .object({
      fileId: id,
      email: z.string().trim().max(320),
      role,
      notify: z.boolean().optional(),
      message: z.string().trim().max(1000).optional(),
      locale: z.string().max(10).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return fail("invalid_email");
  const supabase = await createClient();
  const { data: share, error } = await supabase.rpc("share_file", {
    p_file_id: parsed.data.fileId,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
  });
  if (error) return fail(errorCode(error));
  refresh();

  // Only new shares send an email (changing someone's role doesn't).
  const isNew = share.created_at === share.updated_at;
  if (!isNew || parsed.data.notify === false || !emailConfigured()) return ok({ notified: false, limited: false });

  const { data: details, error: notifyError } = await supabase
    .rpc("prepare_share_notification", { p_share_id: share.id })
    .maybeSingle();
  if (notifyError || !details) return ok({ notified: false, limited: errorCode(notifyError) === "rate_limited" });

  const kind = details.file_kind === "folder" ? "folder" : (nativeType(details.file_mime) ?? "file");
  const url = details.has_account
    ? `${siteUrl()}${itemHref({ id: details.file_id, kind: details.file_kind, mimeType: details.file_mime })}`
    : `${siteUrl()}/signup?email=${encodeURIComponent(details.recipient)}`;
  const email = fileSharedEmail(
    {
      recipient: details.recipient,
      recipientLocale: details.recipient_locale,
      hasAccount: details.has_account,
      itemName: details.file_name,
      itemKind: kind,
      role: details.role,
      senderName: details.sender_name,
      senderEmail: details.sender_email,
      message: parsed.data.message || undefined,
      url,
    },
    parsed.data.locale,
  );
  after(async () => {
    try {
      await sendEmail(email);
    } catch (sendError) {
      console.error("Share email failed", sendError instanceof Error ? sendError.message : sendError);
    }
  });
  return ok({ notified: true, limited: false });
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
