"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  danger = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
}) {
  const t = useTranslations("common");
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <DialogFooter className="mt-2">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          {t("cancel")}
        </Button>
        <Button
          variant={danger ? "danger" : "primary"}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await onConfirm();
              onOpenChange(false);
            })
          }
        >
          {pending ? <Spinner /> : null}
          {confirmLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
