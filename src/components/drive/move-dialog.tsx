"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Folder } from "lucide-react";
import { listFolders, moveItems } from "@/lib/actions/drive";
import { useErrorMessage } from "@/hooks/use-error-message";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { FileItem } from "@/lib/types";

type Crumb = { id: string | null; name: string };
type FolderListing = Awaited<ReturnType<typeof listFolders>>;

export function MoveDialog({
  open,
  onOpenChange,
  items,
  workspaceId,
  rootLabel,
  onMoved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: FileItem[];
  workspaceId: string;
  rootLabel: string;
  onMoved?: () => void;
}) {
  const t = useTranslations("drive");
  const common = useTranslations("common");
  const message = useErrorMessage();
  // Mounted only while open, so the trail starts at the workspace root.
  const [trail, setTrail] = useState<Crumb[]>([{ id: null, name: rootLabel }]);
  const [listing, setListing] = useState<{ parentId: string | null; result: FolderListing } | null>(null);
  const [pending, startTransition] = useTransition();
  const current = trail[trail.length - 1];

  useEffect(() => {
    let cancelled = false;
    listFolders({ workspaceId, parentId: current.id }).then((result) => {
      if (!cancelled) setListing({ parentId: current.id, result });
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, current.id]);

  const movingIds = new Set(items.map((item) => item.id));
  const loaded = listing?.parentId === current.id ? listing.result : null;
  const folders = loaded?.ok ? loaded.data.filter((folder) => !movingIds.has(folder.id)) : null;
  const error = loaded && !loaded.ok ? message(loaded.error) : null;

  const alreadyHere = items.every((item) => item.parentId === current.id);
  const title =
    items.length === 1 ? t("moveTitle", { count: 1, name: items[0].name }) : t("moveTitle", { count: items.length, name: "" });

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title}>
      <div className="flex items-center gap-1 border-b border-border pb-3 text-sm">
        {trail.length > 1 ? (
          <button
            type="button"
            onClick={() => setTrail((value) => value.slice(0, -1))}
            className="rounded-lg p-1 text-muted hover:bg-surface-hover"
            aria-label={common("back")}
          >
            <ChevronLeft className="size-4" />
          </button>
        ) : null}
        <span className="truncate font-medium">{current.id === null ? rootLabel : current.name}</span>
      </div>
      <ul className="h-64 overflow-y-auto py-2" aria-busy={folders === null}>
        {folders === null && !error ? (
          <li className="flex h-full items-center justify-center text-muted">
            <Spinner />
          </li>
        ) : null}
        {error ? <li className="px-2 py-4 text-sm text-danger">{error}</li> : null}
        {folders?.length === 0 ? <li className="px-2 py-4 text-sm text-muted">{t("noSubfolders")}</li> : null}
        {folders?.map((folder) => (
          <li key={folder.id}>
            <button
              type="button"
              onClick={() => setTrail((value) => [...value, { id: folder.id, name: folder.name }])}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-surface-hover"
            >
              <Folder className="size-5 shrink-0 fill-amber-500/20 text-amber-500" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{folder.name}</span>
              <ChevronRight className="size-4 text-muted" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <DialogFooter className="mt-2">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          {common("cancel")}
        </Button>
        <Button
          disabled={pending || alreadyHere}
          onClick={() =>
            startTransition(async () => {
              const result = await moveItems({ ids: items.map((item) => item.id), targetParentId: current.id });
              if (!result.ok) {
                toast.error(message(result.error));
                return;
              }
              toast.success(t("movedToast", { count: items.length }));
              onMoved?.();
              onOpenChange(false);
            })
          }
        >
          {pending ? <Spinner /> : null}
          {t("moveHere")}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
