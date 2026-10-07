"use client";

import { useMemo, useState, useTransition, type DragEvent, type ReactNode } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArchiveRestore,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  FolderInput,
  MoreVertical,
  Pencil,
  Share2,
  Star,
  StarOff,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import {
  deleteItemsForever,
  renameItem,
  restoreItems,
  setStarred,
  trashItems,
} from "@/lib/actions/drive";
import { useErrorMessage } from "@/hooks/use-error-message";
import { cn, formatBytes } from "@/lib/utils";
import { downloadHref, itemHref } from "@/lib/links";
import { importableAs } from "@/lib/editors/native";
import { useOpenWithNuvenca } from "./open-with";
import { ACCESS, type FileItem } from "@/lib/types";
import { DropdownContent, DropdownItem, DropdownMenu, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { Button } from "@/components/ui/button";
import { FileIcon } from "./file-icon";
import { NameDialog } from "./name-dialog";
import { MoveDialog } from "./move-dialog";
import { ShareDialog } from "./share-dialog";
import { ConfirmDialog } from "./confirm-dialog";
import { useUploads, type UploadTarget } from "./upload-provider";

export type BrowserMode = "folder" | "shared" | "recent" | "starred" | "search" | "trash";

type DialogState =
  | { type: "rename"; item: FileItem }
  | { type: "move"; items: FileItem[] }
  | { type: "share"; item: FileItem }
  | { type: "delete"; items: FileItem[] }
  | null;

export function FileBrowser({
  items,
  snippets,
  mode,
  currentUserId,
  uploadTarget,
  workspaceLabels,
  empty,
}: {
  items: FileItem[];
  /** File id → passage that matched a search, with matches marked. */
  snippets?: Record<string, string>;
  mode: BrowserMode;
  currentUserId: string;
  /** Where dropped files go; omit when the user can't add files here. */
  uploadTarget?: (UploadTarget & { label: string }) | null;
  /** Workspace id → display name, for the "Move" dialog root. */
  workspaceLabels: Record<string, string>;
  empty: { icon: ReactNode; title: string; hint?: string };
}) {
  const t = useTranslations("drive");
  const format = useFormatter();
  const locale = useLocale();
  const message = useErrorMessage();
  const router = useRouter();
  const { upload } = useUploads();
  const [rawSelected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<DialogState>(null);
  const [dragging, setDragging] = useState(false);
  const [, startTransition] = useTransition();

  // Ignore selections for items that disappeared after a refresh.
  const selectedItems = useMemo(() => items.filter((item) => rawSelected.has(item.id)), [items, rawSelected]);
  const selected = useMemo(() => new Set(selectedItems.map((item) => item.id)), [selectedItems]);
  const inTrash = mode === "trash";

  const toggle = (id: string) =>
    setSelected(() => {
      const next = new Set(selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // ---- actions -------------------------------------------------------------

  const trash = (targets: FileItem[]) =>
    startTransition(async () => {
      const ids = targets.map((item) => item.id);
      const result = await trashItems({ ids });
      if (!result.ok) return void toast.error(message(result.error));
      setSelected(new Set());
      toast(t("trashedToast", { count: ids.length }), {
        action: {
          label: t("undo"),
          onClick: () => void restoreItems({ ids }).then(() => router.refresh()),
        },
      });
    });

  const restore = (targets: FileItem[]) =>
    startTransition(async () => {
      const result = await restoreItems({ ids: targets.map((item) => item.id) });
      if (!result.ok) return void toast.error(message(result.error));
      setSelected(new Set());
      toast.success(t("restoredToast", { count: targets.length }));
    });

  const star = (item: FileItem) =>
    startTransition(async () => {
      const result = await setStarred({ id: item.id, starred: !item.starred });
      if (!result.ok) toast.error(message(result.error));
    });

  // ---- drag and drop upload -----------------------------------------------

  const acceptsDrop = Boolean(uploadTarget);
  const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes("Files");
  const dropHandlers = acceptsDrop
    ? {
        onDragOver: (event: DragEvent) => {
          if (!hasFiles(event)) return;
          event.preventDefault();
          setDragging(true);
        },
        onDragLeave: (event: DragEvent) => {
          if (event.currentTarget.contains(event.relatedTarget as Node)) return;
          setDragging(false);
        },
        onDrop: (event: DragEvent) => {
          if (!hasFiles(event)) return;
          event.preventDefault();
          setDragging(false);
          const files = Array.from(event.dataTransfer.files).filter((file) => file.size > 0 || file.type);
          if (files.length && uploadTarget) upload(files, uploadTarget);
        },
      }
    : {};

  // ---- rendering -------------------------------------------------------------

  const allSelected = items.length > 0 && selected.size === items.length;
  const canTrashSelection = selectedItems.length > 0 && selectedItems.every((item) => item.accessLevel >= ACCESS.editor);
  const canMoveSelection =
    selectedItems.length > 0 &&
    selectedItems.every((item) => item.accessLevel >= ACCESS.manager) &&
    new Set(selectedItems.map((item) => item.workspaceId)).size === 1;

  return (
    <div {...dropHandlers} className="relative min-h-[50vh]">
      {dragging && uploadTarget ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-primary-soft/80">
          <p className="flex items-center gap-2 font-medium text-primary">
            <UploadCloud className="size-5" aria-hidden />
            {t("dropToUpload", { folder: uploadTarget.label })}
          </p>
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-4 py-20 text-center">
          <div className="text-muted">{empty.icon}</div>
          <p className="mt-4 font-medium">{empty.title}</p>
          {empty.hint ? <p className="mt-1 max-w-sm text-sm text-muted">{empty.hint}</p> : null}
        </div>
      ) : (
        <div role="table" aria-label={t("columns.name")} className="text-sm">
          <div
            role="row"
            className="sticky top-0 z-[5] grid h-11 grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center border-b border-border bg-background text-xs font-medium text-muted sm:grid-cols-[2.5rem_minmax(0,1fr)_9rem_2.5rem] md:grid-cols-[2.5rem_minmax(0,1fr)_10rem_9rem_2.5rem] lg:grid-cols-[2.5rem_minmax(0,1fr)_10rem_9rem_6rem_2.5rem]"
          >
            <span role="columnheader" className="flex justify-center">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => setSelected(allSelected ? new Set() : new Set(items.map((item) => item.id)))}
                aria-label={t("selectAll")}
                className="size-4 accent-primary"
              />
            </span>
            {selected.size > 0 ? (
              <div role="columnheader" className="col-span-full col-start-2 flex items-center gap-1 text-foreground">
                <span className="mr-2 font-medium">{t("selected", { count: selected.size })}</span>
                {inTrash ? (
                  <>
                    <ToolbarButton icon={<ArchiveRestore />} label={t("actions.restore")} onClick={() => restore(selectedItems)} />
                    <ToolbarButton
                      icon={<Trash2 />}
                      label={t("actions.deleteForever")}
                      onClick={() => setDialog({ type: "delete", items: selectedItems })}
                    />
                  </>
                ) : (
                  <>
                    {canMoveSelection ? (
                      <ToolbarButton
                        icon={<FolderInput />}
                        label={t("actions.move")}
                        onClick={() => setDialog({ type: "move", items: selectedItems })}
                      />
                    ) : null}
                    {canTrashSelection ? (
                      <ToolbarButton icon={<Trash2 />} label={t("actions.trash")} onClick={() => trash(selectedItems)} />
                    ) : null}
                  </>
                )}
                <ToolbarButton icon={<X />} label={t("clearSelection")} onClick={() => setSelected(new Set())} />
              </div>
            ) : (
              <>
                <span role="columnheader">{t("columns.name")}</span>
                <span role="columnheader" className="hidden md:block">
                  {t("columns.owner")}
                </span>
                <span role="columnheader" className="hidden sm:block">
                  {inTrash ? t("columns.trashed") : t("columns.modified")}
                </span>
                <span role="columnheader" className="hidden lg:block">
                  {t("columns.size")}
                </span>
                <span role="columnheader" />
              </>
            )}
          </div>

          {items.map((item) => {
            const isSelected = selected.has(item.id);
            const date = inTrash && item.trashedAt ? item.trashedAt : item.updatedAt;
            const owner = item.createdBy === currentUserId ? t("ownerMe") : (item.ownerName ?? "—");
            return (
              <div
                role="row"
                key={item.id}
                aria-selected={isSelected}
                className={cn(
                  "group grid min-h-12 grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center border-b border-border sm:grid-cols-[2.5rem_minmax(0,1fr)_9rem_2.5rem] md:grid-cols-[2.5rem_minmax(0,1fr)_10rem_9rem_2.5rem] lg:grid-cols-[2.5rem_minmax(0,1fr)_10rem_9rem_6rem_2.5rem]",
                  isSelected ? "bg-primary-soft" : "hover:bg-surface-hover",
                )}
              >
                <span role="cell" className="flex justify-center">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(item.id)}
                    aria-label={t("selectItem", { name: item.name })}
                    className="size-4 accent-primary"
                  />
                </span>
                <span role="cell" className="flex min-w-0 items-center gap-3 py-1.5 pr-2">
                  <FileIcon kind={item.kind} name={item.name} mimeType={item.mimeType} />
                  <span className="flex min-w-0 flex-col">
                    <span className="flex min-w-0 items-center gap-3">
                      {inTrash ? (
                        <span className="truncate">{item.name}</span>
                      ) : (
                        <Link href={itemHref(item)} className="truncate hover:underline" title={item.name}>
                          {item.name}
                        </Link>
                      )}
                      {item.starred && !inTrash ? (
                        <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" aria-label={t("actions.star")} />
                      ) : null}
                    </span>
                    {snippets?.[item.id] ? <SearchSnippet text={snippets[item.id]} /> : null}
                  </span>
                </span>
                <span role="cell" className="hidden truncate pr-2 text-muted md:block">
                  {owner}
                </span>
                <span role="cell" className="hidden truncate pr-2 text-muted sm:block">
                  {format.dateTime(new Date(date), { dateStyle: "medium" })}
                </span>
                <span role="cell" className="hidden truncate text-muted lg:block">
                  {item.kind === "folder" ? "—" : formatBytes(item.sizeBytes, locale)}
                </span>
                <span role="cell" className="flex justify-center">
                  <ItemMenu
                    item={item}
                    inTrash={inTrash}
                    onRename={() => setDialog({ type: "rename", item })}
                    onMove={() => setDialog({ type: "move", items: [item] })}
                    onShare={() => setDialog({ type: "share", item })}
                    onStar={() => star(item)}
                    onTrash={() => trash([item])}
                    onRestore={() => restore([item])}
                    onDelete={() => setDialog({ type: "delete", items: [item] })}
                  />
                </span>
              </div>
            );
          })}
        </div>
      )}

      {dialog?.type === "rename" ? (
        <NameDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          title={t("renameTitle")}
          label={t("columns.name")}
          initialValue={dialog.item.name}
          submitLabel={t("actions.rename")}
          selectBaseName={dialog.item.kind === "file"}
          onSubmit={async (name) => {
            if (name === dialog.item.name) return null;
            const result = await renameItem({ id: dialog.item.id, name });
            if (!result.ok) return message(result.error);
            toast.success(t("renamed"));
            return null;
          }}
        />
      ) : null}

      {dialog?.type === "move" ? (
        <MoveDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          items={dialog.items}
          workspaceId={dialog.items[0].workspaceId}
          rootLabel={workspaceLabels[dialog.items[0].workspaceId] ?? ""}
          onMoved={() => setSelected(new Set())}
        />
      ) : null}

      {dialog?.type === "share" ? (
        <ShareDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          fileId={dialog.item.id}
          name={dialog.item.name}
        />
      ) : null}

      {dialog?.type === "delete" ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          title={t("deleteForeverConfirmTitle")}
          description={t("deleteForeverConfirmText", { count: dialog.items.length, name: dialog.items[0].name })}
          confirmLabel={t("actions.deleteForever")}
          danger
          onConfirm={async () => {
            const result = await deleteItemsForever({ ids: dialog.items.map((item) => item.id) });
            if (!result.ok) return void toast.error(message(result.error));
            setSelected(new Set());
            toast.success(t("deletedToast", { count: dialog.items.length }));
          }}
        />
      ) : null}
    </div>
  );
}

function ToolbarButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="rounded-lg p-2 text-muted hover:bg-surface-hover hover:text-foreground [&>svg]:size-4"
    >
      {icon}
    </button>
  );
}

function ItemMenu({
  item,
  inTrash,
  onRename,
  onMove,
  onShare,
  onStar,
  onTrash,
  onRestore,
  onDelete,
}: {
  item: FileItem;
  inTrash: boolean;
  onRename: () => void;
  onMove: () => void;
  onShare: () => void;
  onStar: () => void;
  onTrash: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("drive.actions");
  const router = useRouter();
  const openWith = useOpenWithNuvenca();
  const canEdit = item.accessLevel >= ACCESS.editor;
  const isMember = item.accessLevel >= ACCESS.manager;
  const importable = item.kind === "file" ? importableAs(item.name, item.mimeType) : null;

  return (
    <DropdownMenu>
      <DropdownTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("more")} className="size-8 text-muted">
          <MoreVertical className="size-4" />
        </Button>
      </DropdownTrigger>
      <DropdownContent>
        {inTrash ? (
          <>
            <DropdownItem icon={<ArchiveRestore />} onSelect={onRestore} disabled={!canEdit}>
              {t("restore")}
            </DropdownItem>
            <DropdownItem icon={<Trash2 />} onSelect={onDelete} disabled={!canEdit} danger>
              {t("deleteForever")}
            </DropdownItem>
          </>
        ) : (
          <>
            <DropdownItem icon={<ExternalLink />} onSelect={() => router.push(itemHref(item))}>
              {t("open")}
            </DropdownItem>
            {importable ? (
              <DropdownItem
                icon={importable === "document" ? <FileText /> : <FileSpreadsheet />}
                onSelect={() => openWith.open(item.id)}
              >
                {importable === "document" ? t("openWithDocs") : t("openWithSheets")}
              </DropdownItem>
            ) : null}
            {item.kind === "file" ? (
              <DropdownItem icon={<Download />} onSelect={() => window.location.assign(downloadHref(item.id))}>
                {t("download")}
              </DropdownItem>
            ) : null}
            <DropdownSeparator />
            {canEdit ? (
              <DropdownItem icon={<Share2 />} onSelect={onShare}>
                {t("share")}
              </DropdownItem>
            ) : null}
            {canEdit ? (
              <DropdownItem icon={<Pencil />} onSelect={onRename}>
                {t("rename")}
              </DropdownItem>
            ) : null}
            {isMember ? (
              <DropdownItem icon={<FolderInput />} onSelect={onMove}>
                {t("move")}
              </DropdownItem>
            ) : null}
            <DropdownItem icon={item.starred ? <StarOff /> : <Star />} onSelect={onStar}>
              {item.starred ? t("unstar") : t("star")}
            </DropdownItem>
            {canEdit ? (
              <>
                <DropdownSeparator />
                <DropdownItem icon={<Trash2 />} onSelect={onTrash} danger>
                  {t("trash")}
                </DropdownItem>
              </>
            ) : null}
          </>
        )}
      </DropdownContent>
    </DropdownMenu>
  );
}

/** A passage from inside a file, with the search matches (U+E000…U+E001) highlighted. */
function SearchSnippet({ text }: { text: string }) {
  const parts = text.split(/(\uE000[^\uE001]*\uE001)/);
  return (
    <span className="line-clamp-2 text-xs text-muted" data-testid="search-snippet">
      {parts.map((part, index) =>
        part.startsWith("\uE000") ? (
          <mark key={index} className="rounded-sm bg-amber-100 text-foreground dark:bg-amber-500/30">
            {part.slice(1, -1)}
          </mark>
        ) : (
          part
        ),
      )}
    </span>
  );
}
