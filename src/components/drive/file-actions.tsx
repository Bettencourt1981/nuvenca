"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Download, Share2, Star } from "lucide-react";
import { setStarred } from "@/lib/actions/drive";
import { useErrorMessage } from "@/hooks/use-error-message";
import { Button, buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ShareDialog } from "./share-dialog";

export function FileActions({
  fileId,
  name,
  starred,
  canShare,
  downloadHref,
}: {
  fileId: string;
  name: string;
  starred: boolean;
  canShare: boolean;
  downloadHref: string;
}) {
  const t = useTranslations("drive.actions");
  const message = useErrorMessage();
  const [shareOpen, setShareOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        disabled={pending}
        aria-label={starred ? t("unstar") : t("star")}
        title={starred ? t("unstar") : t("star")}
        onClick={() =>
          startTransition(async () => {
            const result = await setStarred({ id: fileId, starred: !starred });
            if (!result.ok) toast.error(message(result.error));
          })
        }
      >
        <Star className={cn("size-5", starred ? "fill-amber-400 text-amber-400" : "text-muted")} />
      </Button>
      <a href={downloadHref} className={buttonClasses({ variant: "secondary" })}>
        <Download className="size-4" />
        <span className="hidden sm:inline">{t("download")}</span>
      </a>
      {canShare ? (
        <>
          <Button onClick={() => setShareOpen(true)}>
            <Share2 className="size-4" />
            <span className="hidden sm:inline">{t("share")}</span>
          </Button>
          {shareOpen ? <ShareDialog open onOpenChange={setShareOpen} fileId={fileId} name={name} /> : null}
        </>
      ) : null}
    </div>
  );
}
