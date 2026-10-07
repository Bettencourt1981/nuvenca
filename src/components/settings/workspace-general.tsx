"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { LogOut } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { removeMember, renameWorkspace } from "@/lib/actions/workspace";
import { useErrorMessage } from "@/hooks/use-error-message";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDialog } from "@/components/drive/confirm-dialog";

export function WorkspaceRenameForm({ workspaceId, name }: { workspaceId: string; name: string }) {
  const t = useTranslations("workspace");
  const common = useTranslations("common");
  const message = useErrorMessage();
  const [value, setValue] = useState(name);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await renameWorkspace({ workspaceId, name: value });
          if (!result.ok) return void toast.error(message(result.error));
          toast.success(t("renamed"));
        });
      }}
    >
      <div className="flex-1">
        <Label htmlFor="workspace-name">{t("name")}</Label>
        <Input id="workspace-name" value={value} maxLength={100} onChange={(event) => setValue(event.target.value)} />
      </div>
      <Button type="submit" disabled={pending || !value.trim() || value.trim() === name}>
        {pending ? <Spinner /> : null}
        {common("save")}
      </Button>
    </form>
  );
}

export function LeaveWorkspaceButton({ workspaceId, userId }: { workspaceId: string; userId: string }) {
  const t = useTranslations("workspace");
  const message = useErrorMessage();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <LogOut className="size-4" />
        {t("leave")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("leave")}
        description={t("leaveConfirm")}
        confirmLabel={t("leave")}
        danger
        onConfirm={async () => {
          const result = await removeMember({ workspaceId, userId });
          if (!result.ok) return void toast.error(message(result.error));
          toast.success(t("left"));
          router.push("/drive");
        }}
      />
    </>
  );
}
