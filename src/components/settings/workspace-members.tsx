"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { addMember, listMembers, removeMember, updateMemberRole, type WorkspaceMember } from "@/lib/actions/workspace";
import { useErrorMessage } from "@/hooks/use-error-message";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { initials } from "@/lib/utils";

export function WorkspaceMembers({
  workspaceId,
  currentUserId,
  canManage,
}: {
  workspaceId: string;
  currentUserId: string;
  canManage: boolean;
}) {
  const t = useTranslations("workspace");
  const message = useErrorMessage();
  const [loaded, setLoaded] = useState<Awaited<ReturnType<typeof listMembers>> | null>(null);
  const [version, setVersion] = useState(0);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    listMembers({ workspaceId }).then((result) => {
      if (!cancelled) setLoaded(result);
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, version]);

  const members: WorkspaceMember[] | null = loaded?.ok ? loaded.data : null;

  const run = (action: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    startTransition(async () => {
      const result = await action();
      if (!result.ok) return void toast.error(message(result.error));
      toast.success(success);
      setVersion((value) => value + 1);
    });

  return (
    <div className="space-y-4">
      {canManage ? (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            const value = email.trim();
            if (!value) return;
            run(async () => {
              const result = await addMember({ workspaceId, email: value, role });
              if (result.ok) setEmail("");
              return result;
            }, t("memberAdded"));
          }}
        >
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t("addMember")}
            aria-label={t("addMember")}
            aria-describedby="add-member-hint"
            className="flex-1"
          />
          <div className="flex gap-2">
            <Select value={role} onChange={(event) => setRole(event.target.value as "member" | "admin")} className="w-auto">
              <option value="member">{t("roles.member")}</option>
              <option value="admin">{t("roles.admin")}</option>
            </Select>
            <Button type="submit" disabled={pending || !email.trim()}>
              {t("addMember")}
            </Button>
          </div>
        </form>
      ) : null}
      {canManage ? (
        <p id="add-member-hint" className="-mt-2 text-xs text-muted">
          {t("addMemberHint")}
        </p>
      ) : null}

      {loaded && !loaded.ok ? (
        <p className="text-sm text-danger">{message(loaded.error)}</p>
      ) : members === null ? (
        <div className="flex justify-center py-6 text-muted">
          <Spinner />
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {members.map((member) => (
            <li key={member.userId} className="flex items-center gap-3 py-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                {initials(member.fullName ?? member.email)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{member.fullName ?? member.email}</p>
                {member.fullName ? <p className="truncate text-xs text-muted">{member.email}</p> : null}
              </div>
              {canManage && member.role !== "owner" ? (
                <div className="flex items-center gap-1">
                  <Select
                    value={member.role}
                    className="h-8 w-auto text-xs"
                    aria-label={member.email}
                    disabled={pending}
                    onChange={(event) =>
                      run(
                        () =>
                          updateMemberRole({
                            workspaceId,
                            userId: member.userId,
                            role: event.target.value as "member" | "admin",
                          }),
                        t("roleUpdated"),
                      )
                    }
                  >
                    <option value="member">{t("roles.member")}</option>
                    <option value="admin">{t("roles.admin")}</option>
                  </Select>
                  {member.userId !== currentUserId ? (
                    <button
                      type="button"
                      className="rounded-lg p-1.5 text-muted hover:bg-surface-hover hover:text-danger"
                      aria-label={t("removeMember")}
                      disabled={pending}
                      onClick={() => run(() => removeMember({ workspaceId, userId: member.userId }), t("memberRemoved"))}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  ) : null}
                </div>
              ) : (
                <span className="text-sm text-muted">{t(`roles.${member.role}`)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
