"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CloudOff, Loader2, MessageSquare, Share2, Star, CloudCheck, CircleAlert } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { renameItem, setStarred } from "@/lib/actions/drive";
import { useErrorMessage } from "@/hooks/use-error-message";
import { Button } from "@/components/ui/button";
import { ShareDialog } from "@/components/drive/share-dialog";
import { FileIcon } from "@/components/drive/file-icon";
import type { Collaborator, ConnectionStatus, SaveStatus } from "@/lib/collab/provider";
import { NATIVE_MIME, type NativeType } from "@/lib/editors/native";
import { cn, initials } from "@/lib/utils";
import { ACCESS } from "@/lib/types";

export type EditorFile = {
  id: string;
  name: string;
  starred: boolean;
  accessLevel: number;
  type: NativeType;
};

export function EditorHeader({
  file,
  backHref,
  status,
  saveStatus,
  peers,
  menu,
  comments,
}: {
  file: EditorFile;
  backHref: string;
  status: ConnectionStatus;
  saveStatus: SaveStatus;
  peers: Collaborator[];
  menu?: ReactNode;
  comments?: { open: boolean; count: number; onToggle: () => void };
}) {
  const t = useTranslations("editor");
  const actions = useTranslations("drive.actions");
  const message = useErrorMessage();
  const canEdit = file.accessLevel >= ACCESS.editor;
  const [name, setName] = useState(file.name);
  const [starred, setStarredState] = useState(file.starred);
  const [shareOpen, setShareOpen] = useState(false);
  const [, startTransition] = useTransition();

  const commitName = () => {
    const next = name.trim();
    if (!next || next === file.name) {
      setName(file.name);
      return;
    }
    startTransition(async () => {
      const result = await renameItem({ id: file.id, name: next });
      if (!result.ok) {
        toast.error(message(result.error));
        setName(file.name);
      }
    });
  };

  return (
    <header className="no-print flex shrink-0 items-start gap-2 border-b border-border bg-surface px-2 pb-1 pt-2 sm:gap-3 sm:px-4">
      <Link href={backHref} className="mt-0.5 shrink-0 rounded-lg p-1.5 hover:bg-surface-hover" aria-label={t("backToDrive")}>
        <FileIcon kind="file" name={file.name} mimeType={NATIVE_MIME[file.type]} className="size-8" />
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1">
          {canEdit ? (
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={commitName}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") {
                  setName(file.name);
                  event.currentTarget.blur();
                }
              }}
              aria-label={t("title")}
              maxLength={255}
              className="min-w-0 max-w-full truncate rounded-md border border-transparent px-1.5 py-0.5 text-lg hover:border-border focus:border-primary focus:outline-none"
              style={{ width: `${Math.min(Math.max(name.length, 8), 60) + 2}ch` }}
            />
          ) : (
            <h1 className="truncate px-1.5 text-lg">{name}</h1>
          )}
          <button
            type="button"
            onClick={() =>
              startTransition(async () => {
                const result = await setStarred({ id: file.id, starred: !starred });
                if (result.ok) setStarredState(!starred);
                else toast.error(message(result.error));
              })
            }
            className="rounded-lg p-1 text-muted hover:bg-surface-hover"
            aria-label={starred ? actions("unstar") : actions("star")}
            title={starred ? actions("unstar") : actions("star")}
          >
            <Star className={cn("size-4", starred && "fill-amber-400 text-amber-400")} />
          </button>
          <SaveIndicator status={status} saveStatus={saveStatus} canEdit={canEdit} />
        </div>
        {menu ? <nav className="flex flex-wrap items-center">{menu}</nav> : null}
      </div>

      <div className="mt-1 flex shrink-0 items-center gap-2">
        <PresenceAvatars peers={peers} />
        {comments ? (
          <Button
            variant={comments.open ? "secondary" : "ghost"}
            size="icon"
            onClick={comments.onToggle}
            aria-label={t("comments.title")}
            aria-pressed={comments.open}
            title={t("comments.title")}
            className="relative"
          >
            <MessageSquare className="size-5" />
            {comments.count > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                {comments.count}
              </span>
            ) : null}
          </Button>
        ) : null}
        {canEdit ? (
          <>
            <Button onClick={() => setShareOpen(true)} className="rounded-full">
              <Share2 className="size-4" />
              <span className="hidden sm:inline">{actions("share")}</span>
            </Button>
            {shareOpen ? <ShareDialog open onOpenChange={setShareOpen} fileId={file.id} name={name} /> : null}
          </>
        ) : null}
      </div>
    </header>
  );
}

function SaveIndicator({
  status,
  saveStatus,
  canEdit,
}: {
  status: ConnectionStatus;
  saveStatus: SaveStatus;
  canEdit: boolean;
}) {
  const t = useTranslations("editor");
  let icon: ReactNode;
  let label: string;
  if (status === "offline") {
    icon = <CloudOff className="size-4" />;
    label = canEdit ? t("offlineEditing") : t("offline");
  } else if (!canEdit) {
    icon = null;
    label = t("viewOnly");
  } else if (saveStatus === "error") {
    icon = <CircleAlert className="size-4 text-danger" />;
    label = t("saveError");
  } else if (saveStatus === "saving" || saveStatus === "unsaved") {
    icon = <Loader2 className="size-4 animate-spin" />;
    label = t("saving");
  } else {
    icon = <CloudCheck className="size-4" />;
    label = t("saved");
  }
  return (
    <span className="ml-1 hidden items-center gap-1.5 whitespace-nowrap text-xs text-muted sm:inline-flex" role="status">
      {icon}
      {label}
    </span>
  );
}

export function PresenceAvatars({ peers }: { peers: Collaborator[] }) {
  const t = useTranslations("editor");
  // One avatar per person, even if they have several tabs open.
  const unique = Array.from(new Map(peers.map((peer) => [peer.userId, peer])).values());
  if (unique.length === 0) return null;
  const shown = unique.slice(0, 4);
  return (
    <div className="flex -space-x-2" aria-label={t("activeNow", { count: unique.length })}>
      {shown.map((peer) => (
        <span
          key={peer.userId}
          title={peer.canEdit ? peer.name : t("viewing", { name: peer.name })}
          className="flex size-8 items-center justify-center rounded-full border-2 border-surface text-xs font-semibold text-white"
          style={{ backgroundColor: peer.color }}
        >
          {initials(peer.name)}
        </span>
      ))}
      {unique.length > shown.length ? (
        <span className="flex size-8 items-center justify-center rounded-full border-2 border-surface bg-surface-muted text-xs font-semibold">
          +{unique.length - shown.length}
        </span>
      ) : null}
    </div>
  );
}

/** Top-level menu ("File", "Insert"…) in an editor's menu bar. */
export function MenuBarButton({ children, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className="rounded-md px-2 py-0.5 text-sm text-foreground hover:bg-surface-hover data-[state=open]:bg-surface-hover"
      {...props}
    >
      {children}
    </button>
  );
}
