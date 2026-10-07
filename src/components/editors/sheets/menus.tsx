"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  ChartColumn,
  CloudUpload,
  Copy,
  Download,
  FilePlus2,
  Filter,
  History,
  MessageSquarePlus,
  Printer,
  Redo2,
  Scissors,
  Trash2,
  Undo2,
} from "lucide-react";
import { DropdownContent, DropdownItem, DropdownMenu, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { columnName, type CellPos } from "@/lib/editors/sheets/address";
import { PreloadGoogle } from "@/components/google/google-drive";
import { NUMBER_FORMATS } from "@/lib/editors/sheets/format";
import { MenuBarButton } from "../editor-header";
import type { SheetCommand } from "./toolbar";
import type { GridTarget } from "./grid";

function Menu({ name, children }: { name: "file" | "edit" | "view" | "insert" | "format" | "data"; children: React.ReactNode }) {
  const t = useTranslations("editor");
  return (
    <DropdownMenu>
      <DropdownTrigger asChild>
        <MenuBarButton>{t(`menus.${name}`)}</MenuBarButton>
      </DropdownTrigger>
      <DropdownContent align="start" className="min-w-60" onCloseAutoFocus={(event) => event.preventDefault()}>
        {children}
      </DropdownContent>
    </DropdownMenu>
  );
}

export function SheetMenus({
  canEdit,
  hasFilter,
  frozen,
  activeCell,
  onCommand,
  onNew,
  onDownloadXlsx,
  onDownloadCsv,
  onSaveToGoogle,
  onHistory,
  onTrash,
  onFreeze,
  onInsert,
  onDelete,
  onSort,
}: {
  canEdit: boolean;
  hasFilter: boolean;
  frozen: { rows: number; cols: number };
  activeCell: CellPos;
  onCommand: (command: SheetCommand) => void;
  onNew: () => void;
  onDownloadXlsx: () => void;
  onDownloadCsv: () => void;
  /** "Save to Google Drive" (absent when Google isn't configured). */
  onSaveToGoogle?: (() => void) | null;
  onHistory: () => void;
  onTrash: () => void;
  onFreeze: (rows: number, cols: number) => void;
  onInsert: (what: "rowAbove" | "rowBelow" | "colLeft" | "colRight" | "sheet") => void;
  onDelete: (what: "rows" | "cols" | "values") => void;
  onSort: (ascending: boolean) => void;
}) {
  const t = useTranslations("editor");
  const ts = useTranslations("editor.sheets");

  return (
    <>
      <Menu name="file">
        {canEdit ? (
          <DropdownItem icon={<FilePlus2 />} onSelect={onNew}>
            {ts("newSpreadsheet")}
          </DropdownItem>
        ) : null}
        <DropdownItem icon={<Download />} onSelect={onDownloadXlsx}>
          {ts("downloadXlsx")}
        </DropdownItem>
        <DropdownItem icon={<Download />} onSelect={onDownloadCsv}>
          {ts("downloadCsv")}
        </DropdownItem>
        {onSaveToGoogle ? (
          <>
            <PreloadGoogle />
            <DropdownItem icon={<CloudUpload />} onSelect={onSaveToGoogle}>
              {t("saveToGoogle")}
            </DropdownItem>
          </>
        ) : null}
        <DropdownItem icon={<Printer />} onSelect={() => onCommand({ type: "print" })}>
          {t("docs.printPdf")}
        </DropdownItem>
        {canEdit ? (
          <>
            <DropdownSeparator />
            <DropdownItem icon={<History />} onSelect={onHistory}>
              {t("history.title")}
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem icon={<Trash2 />} onSelect={onTrash} danger>
              {t("moveToTrash")}
            </DropdownItem>
          </>
        ) : null}
      </Menu>
      {canEdit ? (
        <>
          <Menu name="edit">
            <DropdownItem icon={<Undo2 />} onSelect={() => onCommand({ type: "undo" })}>
              {t("docs.undo")}
            </DropdownItem>
            <DropdownItem icon={<Redo2 />} onSelect={() => onCommand({ type: "redo" })}>
              {t("docs.redo")}
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem onSelect={() => onDelete("values")}>{ts("deleteValues")}</DropdownItem>
            <DropdownItem onSelect={() => onDelete("rows")}>{ts("deleteRows")}</DropdownItem>
            <DropdownItem onSelect={() => onDelete("cols")}>{ts("deleteCols")}</DropdownItem>
          </Menu>
          <Menu name="view">
            <DropdownItem onSelect={() => onFreeze(0, frozen.cols)}>{ts("freeze.noRows")}</DropdownItem>
            <DropdownItem onSelect={() => onFreeze(1, frozen.cols)}>{ts("freeze.rows", { count: 1 })}</DropdownItem>
            <DropdownItem onSelect={() => onFreeze(2, frozen.cols)}>{ts("freeze.rows", { count: 2 })}</DropdownItem>
            <DropdownItem disabled={activeCell.row === 0} onSelect={() => onFreeze(activeCell.row + 1, frozen.cols)}>
              {ts("freeze.upToRow", { row: activeCell.row + 1 })}
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem onSelect={() => onFreeze(frozen.rows, 0)}>{ts("freeze.noCols")}</DropdownItem>
            <DropdownItem onSelect={() => onFreeze(frozen.rows, 1)}>{ts("freeze.cols", { count: 1 })}</DropdownItem>
            <DropdownItem disabled={activeCell.col === 0} onSelect={() => onFreeze(frozen.rows, activeCell.col + 1)}>
              {ts("freeze.upToCol", { col: columnName(activeCell.col) })}
            </DropdownItem>
          </Menu>
          <Menu name="insert">
            <DropdownItem onSelect={() => onInsert("rowAbove")}>{ts("insert.rowAbove")}</DropdownItem>
            <DropdownItem onSelect={() => onInsert("rowBelow")}>{ts("insert.rowBelow")}</DropdownItem>
            <DropdownItem onSelect={() => onInsert("colLeft")}>{ts("insert.colLeft")}</DropdownItem>
            <DropdownItem onSelect={() => onInsert("colRight")}>{ts("insert.colRight")}</DropdownItem>
            <DropdownSeparator />
            <DropdownItem onSelect={() => onInsert("sheet")}>{ts("insert.sheet")}</DropdownItem>
            <DropdownItem icon={<ChartColumn />} onSelect={() => onCommand({ type: "chart" })}>
              {ts("insertChart")}
            </DropdownItem>
            <DropdownItem icon={<MessageSquarePlus />} onSelect={() => onCommand({ type: "comment" })}>
              {t("docs.addComment")}
            </DropdownItem>
            <DropdownSeparator />
            {["SUM", "AVERAGE", "COUNT", "MAX", "MIN", "IF", "VLOOKUP"].map((name) => (
              <DropdownItem key={name} onSelect={() => onCommand({ type: "function", name })}>
                <span className="font-mono text-xs">{name}</span>
              </DropdownItem>
            ))}
          </Menu>
          <Menu name="format">
            {(Object.keys(NUMBER_FORMATS) as (keyof typeof NUMBER_FORMATS)[]).map((key) => (
              <DropdownItem key={key} onSelect={() => onCommand({ type: "format", pattern: NUMBER_FORMATS[key] })}>
                {ts(`formats.${key}`)}
              </DropdownItem>
            ))}
            <DropdownSeparator />
            <DropdownItem onSelect={() => onCommand({ type: "toggle", key: "b" })}>{t("docs.bold")}</DropdownItem>
            <DropdownItem onSelect={() => onCommand({ type: "toggle", key: "i" })}>{t("docs.italic")}</DropdownItem>
            <DropdownItem onSelect={() => onCommand({ type: "toggle", key: "u" })}>{t("docs.underline")}</DropdownItem>
            <DropdownItem onSelect={() => onCommand({ type: "toggle", key: "st" })}>{t("docs.strike")}</DropdownItem>
            <DropdownItem onSelect={() => onCommand({ type: "toggle", key: "wrap" })}>{ts("wrap")}</DropdownItem>
            <DropdownItem onSelect={() => onCommand({ type: "merge" })}>{ts("merge")}</DropdownItem>
            <DropdownSeparator />
            <DropdownItem onSelect={() => onCommand({ type: "clearFormatting" })}>{t("docs.clearFormatting")}</DropdownItem>
          </Menu>
          <Menu name="data">
            <DropdownItem icon={<ArrowDownAZ />} onSelect={() => onSort(true)}>
              {ts("sortSheetAsc", { col: columnName(activeCell.col) })}
            </DropdownItem>
            <DropdownItem icon={<ArrowUpAZ />} onSelect={() => onSort(false)}>
              {ts("sortSheetDesc", { col: columnName(activeCell.col) })}
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem icon={<Filter />} onSelect={() => onCommand({ type: "filter" })}>
              {hasFilter ? ts("removeFilter") : ts("createFilter")}
            </DropdownItem>
          </Menu>
        </>
      ) : null}
    </>
  );
}

export function ContextMenu({
  position,
  target,
  canEdit,
  canComment,
  actions,
  onClose,
}: {
  position: { x: number; y: number };
  target: GridTarget;
  canEdit: boolean;
  canComment: boolean;
  actions: Record<
    | "insertRowAbove"
    | "insertRowBelow"
    | "insertColLeft"
    | "insertColRight"
    | "deleteRows"
    | "deleteCols"
    | "clear"
    | "sortAsc"
    | "sortDesc"
    | "comment"
    | "copy"
    | "cut",
    () => void
  >;
  onClose: () => void;
}) {
  const t = useTranslations("editor.sheets");
  const d = useTranslations("editor.docs");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const item = (label: string, action: () => void, icon?: React.ReactNode, danger = false) => (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        action();
        onClose();
      }}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left text-sm hover:bg-surface-hover focus:bg-surface-hover focus:outline-none ${danger ? "text-danger" : ""}`}
    >
      <span className="flex size-4 items-center justify-center text-muted [&>svg]:size-4">{icon}</span>
      {label}
    </button>
  );
  const separator = <hr className="my-1 border-border" />;

  return (
    <div className="fixed inset-0 z-50" onMouseDown={onClose} onContextMenu={(event) => event.preventDefault()}>
      <div
        ref={ref}
        role="menu"
        className="absolute min-w-56 rounded-xl border border-border bg-surface p-1.5 shadow-xl"
        style={{ left: Math.min(position.x, window.innerWidth - 240), top: Math.min(position.y, window.innerHeight - 420) }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {canEdit ? item(t("context.cut"), actions.cut, <Scissors />) : null}
        {item(t("context.copy"), actions.copy, <Copy />)}
        {canEdit ? (
          <>
            {separator}
            {target.kind !== "col" ? item(t("insert.rowAbove"), actions.insertRowAbove) : null}
            {target.kind !== "col" ? item(t("insert.rowBelow"), actions.insertRowBelow) : null}
            {target.kind !== "row" ? item(t("insert.colLeft"), actions.insertColLeft) : null}
            {target.kind !== "row" ? item(t("insert.colRight"), actions.insertColRight) : null}
            {separator}
            {target.kind !== "col" ? item(t("deleteRows"), actions.deleteRows, <Trash2 />, true) : null}
            {target.kind !== "row" ? item(t("deleteCols"), actions.deleteCols, <Trash2 />, true) : null}
            {item(t("deleteValues"), actions.clear)}
            {separator}
            {item(target.kind === "col" ? t("sortSheetAsc", { col: columnName(target.col) }) : t("sortRangeAsc"), actions.sortAsc, <ArrowDownAZ />)}
            {item(target.kind === "col" ? t("sortSheetDesc", { col: columnName(target.col) }) : t("sortRangeDesc"), actions.sortDesc, <ArrowUpAZ />)}
          </>
        ) : null}
        {canComment && target.kind === "cell" ? (
          <>
            {separator}
            {item(d("addComment"), actions.comment, <MessageSquarePlus />)}
          </>
        ) : null}
      </div>
    </div>
  );
}
