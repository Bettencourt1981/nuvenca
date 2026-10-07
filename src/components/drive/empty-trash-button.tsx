"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { emptyTrash } from "@/lib/actions/drive";
import { useErrorMessage } from "@/hooks/use-error-message";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "./confirm-dialog";

export function EmptyTrashButton({ workspaceId, disabled }: { workspaceId: string; disabled?: boolean }) {
  const t = useTranslations("drive");
  const message = useErrorMessage();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} disabled={disabled}>
        <Trash2 className="size-4" />
        {t("emptyTrashButton")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("emptyTrashConfirmTitle")}
        description={t("emptyTrashConfirmText")}
        confirmLabel={t("emptyTrashButton")}
        danger
        onConfirm={async () => {
          const result = await emptyTrash({ workspaceId });
          if (!result.ok) toast.error(message(result.error));
        }}
      />
    </>
  );
}
