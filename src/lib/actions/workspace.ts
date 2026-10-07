"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/env";
import { errorCode, fail, ok, type ActionResult } from "@/lib/errors";
import { emailConfigured, sendEmail } from "@/lib/email/mailer";
import { memberAddedEmail } from "@/lib/email/templates";
import type { WorkspaceRole } from "@/lib/types";

const id = z.string().uuid();
const memberRole = z.enum(["admin", "member"]);

export type WorkspaceMember = {
  userId: string;
  email: string;
  fullName: string | null;
  role: WorkspaceRole;
};

export async function createTeamWorkspace(input: { name: string }): Promise<ActionResult<{ id: string }>> {
  const parsed = z.object({ name: z.string().max(100) }).safeParse(input);
  if (!parsed.success) return fail("invalid_name");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_team_workspace", { p_name: parsed.data.name });
  if (error) return fail(errorCode(error));
  refresh();
  return ok({ id: data.id });
}

export async function renameWorkspace(input: { workspaceId: string; name: string }): Promise<ActionResult> {
  const parsed = z.object({ workspaceId: id, name: z.string().max(100) }).safeParse(input);
  if (!parsed.success) return fail("invalid_name");
  const supabase = await createClient();
  const { error } = await supabase.rpc("rename_workspace", {
    p_workspace_id: parsed.data.workspaceId,
    p_name: parsed.data.name,
  });
  if (error) return fail(errorCode(error));
  refresh();
  return ok(undefined);
}

export async function listMembers(input: { workspaceId: string }): Promise<ActionResult<WorkspaceMember[]>> {
  const parsed = z.object({ workspaceId: id }).safeParse(input);
  if (!parsed.success) return fail("generic");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_workspace_members", { p_workspace_id: parsed.data.workspaceId });
  if (error) return fail(errorCode(error));
  return ok(
    (data ?? []).map((m) => ({ userId: m.user_id, email: m.email, fullName: m.full_name, role: m.role })),
  );
}

export async function addMember(input: {
  workspaceId: string;
  email: string;
  role: "admin" | "member";
  /** The inviter's interface language (fallback for the email). */
  locale?: string;
}): Promise<ActionResult> {
  const parsed = z
    .object({ workspaceId: id, email: z.string().trim().max(320), role: memberRole, locale: z.string().max(10).optional() })
    .safeParse(input);
  if (!parsed.success) return fail("invalid_email");
  const supabase = await createClient();
  const { data: member, error } = await supabase.rpc("add_workspace_member", {
    p_workspace_id: parsed.data.workspaceId,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
  });
  if (error) return fail(errorCode(error));

  if (emailConfigured()) {
    const { data: details } = await supabase
      .rpc("prepare_member_notification", { p_workspace_id: parsed.data.workspaceId, p_user_id: member.user_id })
      .maybeSingle();
    if (details) {
      const email = memberAddedEmail(
        {
          recipient: details.recipient,
          recipientLocale: details.recipient_locale,
          workspaceName: details.workspace_name,
          senderName: details.sender_name,
          senderEmail: details.sender_email,
          url: `${siteUrl()}/workspaces/${parsed.data.workspaceId}`,
        },
        parsed.data.locale,
      );
      after(async () => {
        try {
          await sendEmail(email);
        } catch (sendError) {
          console.error("Team email failed", sendError instanceof Error ? sendError.message : sendError);
        }
      });
    }
  }
  return ok(undefined);
}

export async function updateMemberRole(input: {
  workspaceId: string;
  userId: string;
  role: "admin" | "member";
}): Promise<ActionResult> {
  const parsed = z.object({ workspaceId: id, userId: id, role: memberRole }).safeParse(input);
  if (!parsed.success) return fail("generic");
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_workspace_member", {
    p_workspace_id: parsed.data.workspaceId,
    p_user_id: parsed.data.userId,
    p_role: parsed.data.role,
  });
  if (error) return fail(errorCode(error));
  return ok(undefined);
}

export async function removeMember(input: { workspaceId: string; userId: string }): Promise<ActionResult> {
  const parsed = z.object({ workspaceId: id, userId: id }).safeParse(input);
  if (!parsed.success) return fail("generic");
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_workspace_member", {
    p_workspace_id: parsed.data.workspaceId,
    p_user_id: parsed.data.userId,
  });
  if (error) return fail(errorCode(error));
  refresh();
  return ok(undefined);
}
