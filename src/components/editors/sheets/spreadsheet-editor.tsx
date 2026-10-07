"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import * as Y from "yjs";
import { Filter as FilterIcon } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { toBase64 } from "@/lib/collab/base64";
import { createNativeFile } from "@/lib/actions/documents";
import { trashItems } from "@/lib/actions/drive";
import { useErrorMessage } from "@/hooks/use-error-message";
import { ACCESS } from "@/lib/types";
import { Workbook } from "@/lib/editors/sheets/engine";
import { cellName, normalize, parseRange, rangeName, type CellPos } from "@/lib/editors/sheets/address";
import { a1References } from "@/lib/editors/sheets/formula/refs";
import { isError } from "@/lib/editors/sheets/formula/values";
import { newId } from "@/lib/editors/sheets/ids";
import {
  addSheet,
  deleteSheet,
  duplicateSheet,
  moveSheet,
  replaceWorkbook,
  sheetCharts,
  sheetOrder,
  sheetsMap,
  type Chart,
  type CellStyle,
} from "@/lib/editors/sheets/model";
import {
  clearRange,
  copyRange,
  currentRegion,
  deleteColsAt,
  deleteRowsAt,
  fill,
  filteredRows,
  insertColsAt,
  insertRowsAt,
  mergeCells,
  pasteClip,
  pasteText,
  resizeCols,
  resizeRows,
  setBorders,
  setCellInput,
  setFilter,
  setFilterHidden,
  setFrozen,
  setStyle,
  sortRange,
  unmergeCells,
  updateStyle,
  type Clip,
} from "@/lib/editors/sheets/ops";
import { sheetToHtml } from "@/lib/editors/sheets/html";
import { toCsv } from "@/lib/editors/sheets/csv";
import { csvToDoc, xlsxToDoc } from "@/lib/editors/sheets/import-xlsx";
import { EditorHeader, type EditorFile } from "../editor-header";
import { useCollaboration, type CollabUser } from "../use-collaboration";
import { CommentsPanel, useComments } from "../comments";
import { VersionHistoryPanel } from "../version-history";
import { Grid, type GridHandle, type GridTarget, type PeerCursor, type Selection } from "./grid";
import { FormulaInput, type CommitMove } from "./cell-editor";
import { SheetsToolbar, type SheetCommand } from "./toolbar";
import { SheetTabs } from "./sheet-tabs";
import { ChartEditorPanel, ChartLayer } from "./charts";
import { FilterMenu } from "./filter-menu";
import { SheetMenus, ContextMenu } from "./menus";
import { SpreadsheetViewer } from "./spreadsheet-viewer";
import "./sheet.css";

const AUTO_VERSION_EVERY = 10 * 60 * 1000;
const REF_COLORS = ["#1a73e8", "#e8710a", "#9334e6", "#188038", "#d93025", "#12b5cb"];

type CellAnchor = { sheetId: string; rowId: string; colId: string };
type Editing = { row: number; col: number; text: string; from: "cell" | "bar" };
type Panel = "comments" | "history" | "chart" | null;

function adjustDecimals(pattern: string | undefined, delta: 1 | -1): string {
  const base = !pattern || pattern === "General" ? "0" : pattern;
  const match = /0(\.0*)?/.exec(base);
  if (!match) return delta > 0 ? "0.0" : "0";
  const decimals = Math.max(0, (match[1]?.length ?? 1) - 1 + delta);
  const replacement = decimals ? `0.${"0".repeat(decimals)}` : "0";
  return base.slice(0, match.index) + replacement + base.slice(match.index + match[0].length);
}

/** Characters after which a click on a cell inserts a reference into a formula. */
const REF_TRIGGERS = "=(,;+-*/^&<>:";

export function SpreadsheetEditor({
  file,
  user,
  backHref,
  location,
}: {
  file: EditorFile;
  user: CollabUser;
  backHref: string;
  location: { workspaceId: string; parentId: string | null };
}) {
  const t = useTranslations("editor");
  const ts = useTranslations("editor.sheets");
  const locale = useLocale();
  const message = useErrorMessage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const canEdit = file.accessLevel >= ACCESS.editor;
  const canComment = file.accessLevel >= ACCESS.commenter;
  const { doc, provider, status, saveStatus, synced, peers, error } = useCollaboration({ fileId: file.id, canEdit, user });

  // ---------------------------------------------------------------------------
  // Workbook state
  // ---------------------------------------------------------------------------
  const wb = useMemo(() => new Workbook(doc, locale), [doc, locale]);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const onUpdate = () => {
      wb.invalidate();
      setVersion((v) => v + 1);
    };
    doc.on("update", onUpdate);
    return () => doc.off("update", onUpdate);
  }, [doc, wb]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` tracks document changes
  const sheets = useMemo(() => wb.sheets(), [wb, version]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sheetId = sheets.find((s) => s.id === activeId)?.id ?? sheets[0]?.id ?? null;
  const sheet = sheetId ? wb.sheet(sheetId) : undefined;

  const [selection, setSelection] = useState<Selection>({ anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } });
  const [editing, setEditing] = useState<Editing | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [selectedChart, setSelectedChart] = useState<string | null>(null);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ anchor: CellAnchor; quote: string | null } | null>(null);
  const [preview, setPreview] = useState<{ id: string; state: Uint8Array } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; target: GridTarget } | null>(null);
  const [filterMenu, setFilterMenu] = useState<{ col: number; x: number; y: number } | null>(null);
  const gridRef = useRef<GridHandle>(null);
  const cellInput = useRef<HTMLTextAreaElement>(null);
  const barInput = useRef<HTMLTextAreaElement>(null);
  const clipboard = useRef<Clip | null>(null);
  const refInsert = useRef<{ start: number; end: number; anchor: CellPos } | null>(null);
  const comments = useComments<CellAnchor>(file.id, canComment);

  const range = normalize({ r1: selection.anchor.row, c1: selection.anchor.col, r2: selection.focus.row, c2: selection.focus.col });
  const lastRow = (sheet?.rows.length ?? 1) - 1;
  const lastCol = (sheet?.cols.length ?? 1) - 1;

  // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute on document changes
  const hiddenRows = useMemo(() => (sheetId ? filteredRows(wb, sheetId) : new Set<number>()), [wb, sheetId, version]);

  // Undo/redo only covers this person's own edits.
  const [undo] = useState(
    () => new Y.UndoManager([sheetsMap(doc), sheetOrder(doc)], { trackedOrigins: new Set(["local"]), captureTimeout: 400 }),
  );
  const [undoState, setUndoState] = useState({ canUndo: false, canRedo: false });
  useEffect(() => {
    const refresh = () => setUndoState({ canUndo: undo.canUndo(), canRedo: undo.canRedo() });
    undo.on("stack-item-added", refresh);
    undo.on("stack-item-popped", refresh);
    undo.on("stack-cleared", refresh);
    return () => {
      undo.off("stack-item-added", refresh);
      undo.off("stack-item-popped", refresh);
      undo.off("stack-cleared", refresh);
    };
  }, [undo]);
  useEffect(() => () => undo.destroy(), [undo]);

  // ---------------------------------------------------------------------------
  // Collaborators' selections (awareness)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!sheet) return;
    const rowId = (r: number) => sheet.rows[Math.min(r, sheet.rows.length - 1)];
    const colId = (c: number) => sheet.cols[Math.min(c, sheet.cols.length - 1)];
    provider.awareness.setLocalStateField("sheetCursor", {
      sheetId: sheet.id,
      r1: rowId(range.r1),
      c1: colId(range.c1),
      r2: rowId(range.r2),
      c2: colId(range.c2),
    });
  }, [provider, sheet, range.r1, range.c1, range.r2, range.c2]);

  const [awarenessTick, setAwarenessTick] = useState(0);
  useEffect(() => {
    const onChange = () => setAwarenessTick((n) => n + 1);
    provider.awareness.on("change", onChange);
    return () => provider.awareness.off("change", onChange);
  }, [provider]);

  const peerCursors = useMemo<PeerCursor[]>(() => {
    if (!sheet) return [];
    const out: PeerCursor[] = [];
    provider.awareness.getStates().forEach((state, clientId) => {
      if (clientId === doc.clientID) return;
      const cursor = state.sheetCursor as { sheetId: string; r1: string; c1: string; r2: string; c2: string } | undefined;
      const peer = state.user as { name: string; color: string } | undefined;
      if (!cursor || !peer || cursor.sheetId !== sheet.id) return;
      const r1 = sheet.rowIndex.get(cursor.r1);
      const c1 = sheet.colIndex.get(cursor.c1);
      const r2 = sheet.rowIndex.get(cursor.r2);
      const c2 = sheet.colIndex.get(cursor.c2);
      if (r1 === undefined || c1 === undefined || r2 === undefined || c2 === undefined) return;
      out.push({ key: String(clientId), name: peer.name, color: peer.color, range: { r1, c1, r2, c2 } });
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- awarenessTick/version signal changes
  }, [provider, doc, sheet, awarenessTick, version]);

  // ---------------------------------------------------------------------------
  // Selection & editing
  // ---------------------------------------------------------------------------
  const select = useCallback(
    (next: Selection) => {
      const clamp = (p: CellPos) => ({ row: Math.max(0, Math.min(p.row, lastRow)), col: Math.max(0, Math.min(p.col, lastCol)) });
      const value = { anchor: clamp(next.anchor), focus: clamp(next.focus) };
      setSelection(value);
      gridRef.current?.scrollToCell(value.focus);
    },
    [lastRow, lastCol],
  );

  const startEditing = useCallback(
    (initial?: string, from: "cell" | "bar" = "cell") => {
      if (!canEdit || !sheetId) return;
      const { row, col } = selection.anchor;
      setEditing({ row, col, text: initial ?? wb.editText(sheetId, row, col), from });
      refInsert.current = null;
    },
    [canEdit, sheetId, selection.anchor, wb],
  );

  /** A key typed on the grid: starts editing, or adds to an edit whose input has not taken focus yet. */
  const typeIntoCell = useCallback(
    (key: string) => {
      if (!canEdit || !sheetId) return;
      const { row, col } = selection.anchor;
      setEditing((current) =>
        current && current.from === "cell" && current.row === row && current.col === col
          ? { ...current, text: current.text + key }
          : { row, col, text: key, from: "cell" },
      );
      refInsert.current = null;
    },
    [canEdit, sheetId, selection.anchor],
  );

  const commitEditing = useCallback(
    (move: CommitMove) => {
      if (!editing || !sheetId) return;
      setCellInput(wb, sheetId, editing.row, editing.col, editing.text);
      setEditing(null);
      refInsert.current = null;
      const delta = { down: [1, 0], up: [-1, 0], right: [0, 1], left: [0, -1] } as const;
      if (move) {
        const [dr, dc] = delta[move];
        const pos = { row: editing.row + dr, col: editing.col + dc };
        select({ anchor: pos, focus: pos });
      }
      // Synchronously, so keys typed right after Enter/Tab are not lost.
      gridRef.current?.focus();
    },
    [editing, sheetId, wb, select],
  );

  const cancelEditing = useCallback(() => {
    setEditing(null);
    refInsert.current = null;
    gridRef.current?.focus();
  }, []);

  /** While typing a formula, clicking cells inserts their references. */
  const onCellMouseDown = useCallback(
    (pos: CellPos, event: ReactMouseEvent) => {
      if (!editing || !editing.text.startsWith("=")) return false;
      const input = editing.from === "cell" ? cellInput.current : barInput.current;
      if (!input) return false;
      const dragging = event.type === "mousemove";
      if (dragging) {
        const current = refInsert.current;
        if (!current) return false;
        const text = rangeName({ r1: current.anchor.row, c1: current.anchor.col, r2: pos.row, c2: pos.col });
        const next = editing.text.slice(0, current.start) + text + editing.text.slice(current.end);
        refInsert.current = { ...current, end: current.start + text.length };
        setEditing({ ...editing, text: next });
        return true;
      }
      const caret = input.selectionStart ?? editing.text.length;
      const previous = refInsert.current;
      const replacing = previous && previous.end === caret;
      const before = editing.text.slice(0, caret).trimEnd();
      if (!replacing && !REF_TRIGGERS.includes(before[before.length - 1] ?? "")) return false;
      const start = replacing ? previous.start : caret;
      const text = cellName(pos);
      const next = editing.text.slice(0, start) + text + editing.text.slice(replacing ? previous.end : caret);
      refInsert.current = { start, end: start + text.length, anchor: pos };
      setEditing({ ...editing, text: next });
      event.preventDefault();
      requestAnimationFrame(() => {
        input.focus();
        input.setSelectionRange(start + text.length, start + text.length);
      });
      return true;
    },
    [editing],
  );

  // ---------------------------------------------------------------------------
  // Commands
  // ---------------------------------------------------------------------------
  const activeStyle = useMemo<CellStyle>(
    () => (sheetId && wb.cell(sheetId, selection.anchor.row, selection.anchor.col)?.s) || {},
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` tracks document changes
    [wb, sheetId, selection.anchor.row, selection.anchor.col, version],
  );
  const mergedHere = !!sheet?.merges.some((m) => !(m.r2 < range.r1 || m.r1 > range.r2 || m.c2 < range.c1 || m.c1 > range.c2));

  const nextSheetName = useCallback(() => {
    const names = new Set(wb.sheets().map((s) => s.name.toLowerCase()));
    for (let n = wb.sheets().length + 1; ; n++) {
      const name = ts("sheetName", { number: n });
      if (!names.has(name.toLowerCase())) return name;
    }
  }, [wb, ts]);

  const addChart = useCallback(() => {
    if (!sheet || !sheetId) return;
    const area = range.r1 === range.r2 && range.c1 === range.c2 ? currentRegion(wb, sheetId, range.r1, range.c1) : range;
    const id = newId();
    const chart: Chart = {
      type: "column",
      range: { r1: sheet.rows[area.r1], c1: sheet.cols[area.c1], r2: sheet.rows[area.r2], c2: sheet.cols[area.c2] },
      anchor: { rowId: sheet.rows[area.r1], colId: sheet.cols[Math.min(area.c2 + 1, lastCol)], dx: 12, dy: 0 },
      width: 480,
      height: 300,
      headers: true,
    };
    doc.transact(() => sheetCharts(sheet.map).set(id, chart), "local");
    setSelectedChart(id);
    setPanel("chart");
  }, [sheet, sheetId, range, wb, lastCol, doc]);

  const updateChart = useCallback(
    (id: string, patch: Partial<Chart>) => {
      if (!sheet) return;
      const current = sheetCharts(sheet.map).get(id);
      if (current) doc.transact(() => sheetCharts(sheet.map).set(id, { ...current, ...patch }), "local");
    },
    [sheet, doc],
  );

  const startComment = useCallback(() => {
    if (!sheet || !sheetId || !canComment) return;
    const { row, col } = selection.anchor;
    const text = wb.display(sheetId, row, col);
    setDraft({
      anchor: { sheetId, rowId: sheet.rows[row], colId: sheet.cols[col] },
      quote: `${cellName({ row, col })}${text ? `: ${text}` : ""}`,
    });
    setPanel("comments");
  }, [sheet, sheetId, canComment, selection.anchor, wb]);

  const sortBy = useCallback(
    (ascending: boolean, wholeSheet: boolean) => {
      if (!sheet || !sheetId) return;
      let area = wholeSheet ? { r1: sheet.frozenRows, c1: 0, r2: Math.max(sheet.used.rows - 1, 0), c2: lastCol } : range;
      if (!wholeSheet && range.c1 === range.c2) {
        // Like Excel's "expand the selection": a single column sorts with the rest of its rows.
        const region = currentRegion(wb, sheetId, range.r1, range.c1);
        area = { ...range, c1: region.c1, c2: region.c2 };
      }
      sortRange(wb, sheetId, area, selection.anchor.col, ascending);
    },
    [sheet, sheetId, range, wb, lastCol, selection.anchor.col],
  );

  const runCommand = useCallback(
    (command: SheetCommand) => {
      if (!sheetId || (!canEdit && command.type !== "print" && command.type !== "comment")) return;
      switch (command.type) {
        case "undo":
          undo.undo();
          break;
        case "redo":
          undo.redo();
          break;
        case "print": {
          const popup = window.open("", "_blank");
          if (!popup) break;
          popup.document.write(
            `<!doctype html><meta charset="utf-8"><title>${file.name}</title><style>@page{margin:12mm}body{margin:0}</style>${sheetToHtml(wb, sheetId)}`,
          );
          popup.document.close();
          popup.focus();
          popup.print();
          break;
        }
        case "style":
          setStyle(wb, sheetId, range, command.values);
          break;
        case "toggle":
          setStyle(wb, sheetId, range, { [command.key]: activeStyle[command.key] ? undefined : true });
          break;
        case "format":
          setStyle(wb, sheetId, range, { nf: command.pattern || undefined });
          break;
        case "decimals":
          setStyle(wb, sheetId, range, { nf: adjustDecimals(activeStyle.nf, command.delta) });
          break;
        case "borders":
          setBorders(wb, sheetId, range, command.mode);
          break;
        case "merge":
          if (mergedHere) unmergeCells(wb, sheetId, range);
          else mergeCells(wb, sheetId, range);
          break;
        case "clearFormatting":
          updateStyle(wb, sheetId, range, () => ({}));
          break;
        case "function": {
          if (range.r1 !== range.r2 && range.c1 === range.c2) {
            const target = { row: range.r2 + 1, col: range.c1 };
            setCellInput(wb, sheetId, target.row, target.col, `=${command.name}(${rangeName(range)})`);
            select({ anchor: target, focus: target });
          } else {
            startEditing(`=${command.name}(`);
          }
          break;
        }
        case "chart":
          addChart();
          break;
        case "filter":
          if (sheet?.filter) setFilter(wb, sheetId, null);
          else setFilter(wb, sheetId, range.r1 === range.r2 && range.c1 === range.c2 ? currentRegion(wb, sheetId, range.r1, range.c1) : range);
          break;
        case "comment":
          startComment();
          break;
      }
    },
    [sheetId, canEdit, undo, file.name, wb, range, activeStyle, mergedHere, select, startEditing, addChart, sheet, startComment],
  );

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------
  const dataEdge = useCallback(
    (from: CellPos, dr: number, dc: number): CellPos => {
      if (!sheetId) return from;
      const filled = (r: number, c: number) => {
        const cell = wb.cell(sheetId, r, c);
        return cell?.v !== undefined || cell?.f !== undefined;
      };
      let { row, col } = from;
      const startFilled = filled(row, col) && filled(row + dr, col + dc);
      while (row + dr >= 0 && row + dr <= lastRow && col + dc >= 0 && col + dc <= lastCol) {
        const nextFilled = filled(row + dr, col + dc);
        if (startFilled ? !nextFilled : nextFilled) {
          if (!startFilled) {
            row += dr;
            col += dc;
          }
          break;
        }
        row += dr;
        col += dc;
      }
      return { row, col };
    },
    [sheetId, wb, lastRow, lastCol],
  );

  const onGridKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!sheetId) return;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key;
      if (editing) {
        // Keys that reach the grid before the cell input has taken focus.
        if (editing.from !== "cell") return;
        if (key.length === 1 && !mod && !event.altKey) {
          event.preventDefault();
          typeIntoCell(key);
        } else if (key === "Backspace") {
          event.preventDefault();
          setEditing((current) => current && { ...current, text: current.text.slice(0, -1) });
        } else if (key === "Enter" || key === "Tab") {
          event.preventDefault();
          commitEditing(key === "Tab" ? (event.shiftKey ? "left" : "right") : event.shiftKey ? "up" : "down");
        } else if (key === "Escape") {
          event.preventDefault();
          cancelEditing();
        }
        return;
      }
      const move = (dr: number, dc: number) => {
        event.preventDefault();
        const from = event.shiftKey ? selection.focus : selection.anchor;
        let to = { row: from.row + dr, col: from.col + dc };
        if (mod) to = dataEdge(from, dr, dc);
        // Skip rows hidden by a filter.
        while (hiddenRows.has(to.row) && to.row > 0 && to.row < lastRow) to = { ...to, row: to.row + (dr || 1) };
        if (event.shiftKey) select({ anchor: selection.anchor, focus: to });
        else select({ anchor: to, focus: to });
      };
      if (key === "ArrowDown") return move(1, 0);
      if (key === "ArrowUp") return move(-1, 0);
      if (key === "ArrowRight") return move(0, 1);
      if (key === "ArrowLeft") return move(0, -1);
      if (key === "PageDown") return move(20, 0);
      if (key === "PageUp") return move(-20, 0);
      if (key === "Tab") return move(0, event.shiftKey ? -1 : 1);
      if (key === "Home") {
        event.preventDefault();
        const to = mod ? { row: 0, col: 0 } : { row: selection.anchor.row, col: 0 };
        return select({ anchor: to, focus: to });
      }
      if (key === "End" && mod) {
        event.preventDefault();
        const to = { row: Math.max((sheet?.used.rows ?? 1) - 1, 0), col: Math.max((sheet?.used.cols ?? 1) - 1, 0) };
        return select({ anchor: to, focus: to });
      }
      if (mod && !event.altKey) {
        const lower = key.toLowerCase();
        if (lower === "z") {
          event.preventDefault();
          return event.shiftKey ? undo.redo() : undo.undo();
        }
        if (lower === "y") {
          event.preventDefault();
          return undo.redo();
        }
        if (lower === "a") {
          event.preventDefault();
          return select({ anchor: { row: 0, col: 0 }, focus: { row: lastRow, col: lastCol } });
        }
        if (!canEdit) return;
        if (lower === "b" || lower === "i" || lower === "u") {
          event.preventDefault();
          return runCommand({ type: "toggle", key: lower as "b" | "i" | "u" });
        }
        if (key === "5") {
          event.preventDefault();
          return runCommand({ type: "toggle", key: "st" });
        }
        if (lower === "d" || lower === "r") {
          event.preventDefault();
          return fill(wb, sheetId, range, lower === "d" ? "down" : "right");
        }
        return;
      }
      if (mod && event.altKey && key.toLowerCase() === "m") {
        event.preventDefault();
        return startComment();
      }
      if (!canEdit) return;
      if (key === "Enter" || key === "F2") {
        event.preventDefault();
        return startEditing();
      }
      if (key === "Delete" || key === "Backspace") {
        event.preventDefault();
        return clearRange(wb, sheetId, range);
      }
      if (key.length === 1 && !event.altKey) {
        event.preventDefault();
        typeIntoCell(key);
      }
    },
    [sheetId, editing, selection, dataEdge, hiddenRows, lastRow, lastCol, select, sheet, undo, canEdit, runCommand, wb, range, startComment, startEditing, typeIntoCell, commitEditing, cancelEditing],
  );

  // ---------------------------------------------------------------------------
  // Clipboard
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const gridFocused = () => {
      const active = document.activeElement as HTMLElement | null;
      return !!active && (active.classList.contains("sheet-scroller") || active.classList.contains("sheet-input-sink"));
    };
    const onCopy = (event: ClipboardEvent, cut: boolean) => {
      if (!gridFocused() || editing || !sheetId) return;
      const clip = copyRange(wb, sheetId, range);
      clipboard.current = clip;
      event.clipboardData?.setData("text/plain", clip.tsv);
      event.clipboardData?.setData("text/html", sheetToHtml(wb, sheetId, range));
      event.preventDefault();
      if (cut && canEdit) clearRange(wb, sheetId, range, { formats: true });
    };
    const copy = (event: ClipboardEvent) => onCopy(event, false);
    const cut = (event: ClipboardEvent) => onCopy(event, true);
    const paste = (event: ClipboardEvent) => {
      if (!gridFocused() || editing || !sheetId || !canEdit) return;
      event.preventDefault();
      const text = event.clipboardData?.getData("text/plain") ?? "";
      const at = { row: range.r1, col: range.c1 };
      if (clipboard.current && clipboard.current.tsv === text) {
        pasteClip(wb, sheetId, at, clipboard.current, range);
        return;
      }
      const html = event.clipboardData?.getData("text/html");
      let source = text;
      if (html && html.includes("<table")) {
        const table = new DOMParser().parseFromString(html, "text/html").querySelector("table");
        if (table) {
          source = Array.from(table.rows)
            .map((row) => Array.from(row.cells).map((cell) => (cell.textContent ?? "").replace(/\s*\n\s*/g, " ").trim()).join("\t"))
            .join("\n");
        }
      }
      const size = pasteText(wb, sheetId, at, source);
      select({ anchor: at, focus: { row: at.row + size.rows - 1, col: at.col + size.cols - 1 } });
    };
    document.addEventListener("copy", copy);
    document.addEventListener("cut", cut);
    document.addEventListener("paste", paste);
    return () => {
      document.removeEventListener("copy", copy);
      document.removeEventListener("cut", cut);
      document.removeEventListener("paste", paste);
    };
  }, [editing, sheetId, wb, range, canEdit, select]);

  // ---------------------------------------------------------------------------
  // Versions, import, download
  // ---------------------------------------------------------------------------
  const lastVersionAt = useRef(0);
  const createVersion = useCallback(
    async (label: string | null) => {
      const supabase = createClient();
      const { error: versionError } = await supabase.rpc("create_document_version", {
        p_file_id: file.id,
        p_state: toBase64(Y.encodeStateAsUpdate(doc)),
        p_label: label ?? "",
      });
      if (versionError) throw new Error(versionError.message);
      lastVersionAt.current = Date.now();
    },
    [doc, file.id],
  );
  useEffect(() => {
    if (!canEdit) return;
    return provider.on("save", (state) => {
      if (state === "saved" && Date.now() - lastVersionAt.current > AUTO_VERSION_EVERY) void createVersion(null).catch(() => undefined);
    });
  }, [provider, canEdit, createVersion]);

  const importId = canEdit ? searchParams.get("import") : null;
  const importing = useRef(false);

  // A workbook always has a sheet (e.g. a file whose first sheet was never created).
  const emptyWorkbook = synced && !importId && canEdit && sheets.length === 0;
  useEffect(() => {
    if (emptyWorkbook) addSheet(doc, ts("sheetName", { number: 1 }));
  }, [emptyWorkbook, doc, ts]);
  useEffect(() => {
    if (!synced || !importId || importing.current) return;
    importing.current = true;
    (async () => {
      try {
        const response = await fetch(`/api/files/${importId}/download`);
        if (!response.ok) throw new Error("import_failed");
        const data = await response.arrayBuffer();
        const bytes = new Uint8Array(data.slice(0, 2));
        const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
        const imported = isZip
          ? await xlsxToDoc(data, locale)
          : csvToDoc(new TextDecoder().decode(data), ts("sheetName", { number: 1 }), locale);
        replaceWorkbook(doc, imported, "import");
        imported.destroy();
        undo.clear();
        await provider.flushSave();
        await createVersion(t("history.imported"));
      } catch {
        toast.error(t("importFailed"));
      } finally {
        router.replace(`/spreadsheet/${file.id}`);
      }
    })();
  }, [synced, importId, doc, locale, ts, provider, createVersion, router, file.id, t, undo]);

  const downloadXlsx = useCallback(async () => {
    await provider.flushSave();
    const link = document.createElement("a");
    link.href = `/api/files/${file.id}/download`;
    link.click();
  }, [provider, file.id]);

  const downloadCsv = useCallback(() => {
    if (!sheet || !sheetId) return;
    const rows: string[][] = [];
    for (let r = 0; r < sheet.used.rows; r++) {
      const row: string[] = [];
      for (let c = 0; c < sheet.used.cols; c++) row.push(wb.display(sheetId, r, c));
      rows.push(row);
    }
    const blob = new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${file.name} - ${sheet.name}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }, [sheet, sheetId, wb, file.name]);

  const newSpreadsheet = useCallback(async () => {
    const result = await createNativeFile({ ...location, name: ts("untitled"), type: "spreadsheet", sheetName: ts("sheetName", { number: 1 }) });
    if (!result.ok) return void toast.error(message(result.error));
    window.open(`/spreadsheet/${result.data.id}`, "_blank");
  }, [location, ts, message]);

  // ---------------------------------------------------------------------------
  // Comments
  // ---------------------------------------------------------------------------
  const commentCells = useMemo(() => {
    const set = new Set<string>();
    for (const thread of comments.threads) {
      if (!thread.resolved && thread.anchor && thread.anchor.sheetId === sheetId) set.add(`${thread.anchor.rowId}:${thread.anchor.colId}`);
    }
    return set;
  }, [comments.threads, sheetId]);

  const activateThread = useCallback(
    (id: string) => {
      setActiveThread(id);
      const anchor = comments.threads.find((thread) => thread.id === id)?.anchor;
      if (!anchor) return;
      const target = wb.sheet(anchor.sheetId);
      const row = target?.rowIndex.get(anchor.rowId);
      const col = target?.colIndex.get(anchor.colId);
      if (!target || row === undefined || col === undefined) return;
      setActiveId(anchor.sheetId);
      select({ anchor: { row, col }, focus: { row, col } });
    },
    [comments.threads, wb, select],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const editingText = editing?.text ?? (sheetId ? wb.editText(sheetId, selection.anchor.row, selection.anchor.col) : "");
  const formulaRanges = useMemo(() => {
    if (!editing || !editing.text.startsWith("=")) return [];
    return a1References(editing.text.slice(1))
      .filter((ref) => !ref.sheet && ref.r1 !== undefined && ref.c1 !== undefined)
      .map((ref, index) => ({
        range: { r1: ref.r1!, c1: ref.c1!, r2: ref.r2 ?? ref.r1!, c2: ref.c2 ?? ref.c1! },
        color: REF_COLORS[index % REF_COLORS.length],
      }));
  }, [editing]);

  const stats = useMemo(() => {
    if (!sheetId || (range.r1 === range.r2 && range.c1 === range.c2)) return null;
    if ((range.r2 - range.r1 + 1) * (range.c2 - range.c1 + 1) > 50_000) return null;
    let sum = 0;
    let count = 0;
    for (let r = range.r1; r <= Math.min(range.r2, (sheet?.used.rows ?? 0) - 1); r++)
      for (let c = range.c1; c <= Math.min(range.c2, (sheet?.used.cols ?? 0) - 1); c++) {
        const value = wb.value(sheetId, r, c);
        if (typeof value === "number" && !isError(value)) {
          sum += value;
          count++;
        }
      }
    return count > 1 ? { sum, count, average: sum / count } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` tracks document changes
  }, [sheetId, range.r1, range.c1, range.r2, range.c2, wb, sheet, version]);

  const filterRange = useMemo(() => {
    if (!sheet?.filter) return null;
    const r1 = sheet.rowIndex.get(sheet.filter.range.r1);
    const r2 = sheet.rowIndex.get(sheet.filter.range.r2);
    const c1 = sheet.colIndex.get(sheet.filter.range.c1);
    const c2 = sheet.colIndex.get(sheet.filter.range.c2);
    return r1 === undefined || r2 === undefined || c1 === undefined || c2 === undefined ? null : { r1, r2, c1, c2 };
  }, [sheet]);

  const openThreads = comments.threads.filter((thread) => !thread.resolved).length;
  const chart = selectedChart && sheet ? (sheet.charts.find(([id]) => id === selectedChart)?.[1] ?? null) : null;

  const contextActions = (target: GridTarget) => ({
    insertRowAbove: () => insertRowsAt(wb, sheetId!, range.r1, range.r2 - range.r1 + 1),
    insertRowBelow: () => insertRowsAt(wb, sheetId!, range.r2 + 1, range.r2 - range.r1 + 1),
    insertColLeft: () => insertColsAt(wb, sheetId!, range.c1, range.c2 - range.c1 + 1),
    insertColRight: () => insertColsAt(wb, sheetId!, range.c2 + 1, range.c2 - range.c1 + 1),
    deleteRows: () => deleteRowsAt(wb, sheetId!, range.r1, range.r2 - range.r1 + 1),
    deleteCols: () => deleteColsAt(wb, sheetId!, range.c1, range.c2 - range.c1 + 1),
    clear: () => clearRange(wb, sheetId!, range),
    sortAsc: () => sortBy(true, target.kind === "col"),
    sortDesc: () => sortBy(false, target.kind === "col"),
    comment: startComment,
    copy: () => document.execCommand("copy"),
    cut: () => document.execCommand("cut"),
  });

  const sheetMenus = (
    <SheetMenus
      canEdit={canEdit}
      hasFilter={!!sheet?.filter}
      frozen={{ rows: sheet?.frozenRows ?? 0, cols: sheet?.frozenCols ?? 0 }}
      activeCell={selection.anchor}
      onCommand={runCommand}
      onNew={newSpreadsheet}
      onDownloadXlsx={downloadXlsx}
      onDownloadCsv={downloadCsv}
      onHistory={() => setPanel("history")}
      onTrash={async () => {
        const result = await trashItems({ ids: [file.id] });
        if (!result.ok) return void toast.error(message(result.error));
        router.push(backHref);
      }}
      onFreeze={(rows, cols) => sheetId && setFrozen(wb, sheetId, rows, cols)}
      onInsert={(what) => {
        if (!sheetId) return;
        const actions = contextActions({ kind: "cell", row: 0, col: 0 });
        if (what === "rowAbove") actions.insertRowAbove();
        if (what === "rowBelow") actions.insertRowBelow();
        if (what === "colLeft") actions.insertColLeft();
        if (what === "colRight") actions.insertColRight();
        if (what === "sheet") setActiveId(addSheet(doc, nextSheetName()));
      }}
      onDelete={(what) => {
        const actions = contextActions({ kind: "cell", row: 0, col: 0 });
        if (what === "rows") actions.deleteRows();
        if (what === "cols") actions.deleteCols();
        if (what === "values") actions.clear();
      }}
      onSort={(ascending) => sortBy(ascending, true)}
    />
  );

  return (
    <div className="sheet-root flex h-dvh flex-col bg-background">
      <EditorHeader
        file={file}
        backHref={backHref}
        status={status}
        saveStatus={saveStatus}
        peers={peers}
        menu={sheetMenus}
        comments={canComment ? { open: panel === "comments", count: openThreads, onToggle: () => setPanel(panel === "comments" ? null : "comments") } : undefined}
      />
      {canEdit && !preview ? (
        <SheetsToolbar
          style={activeStyle}
          canUndo={undoState.canUndo}
          canRedo={undoState.canRedo}
          hasFilter={!!sheet?.filter}
          merged={mergedHere}
          onCommand={runCommand}
        />
      ) : null}
      {preview ? (
        <div className="no-print flex items-center justify-between gap-3 border-b border-border bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          {t("history.previewing")}
          <button type="button" className="font-medium underline" onClick={() => setPreview(null)}>
            {t("history.backToCurrent")}
          </button>
        </div>
      ) : null}

      {!preview ? (
        <div className="no-print flex items-center gap-2 border-b border-border bg-surface px-2 py-1">
          <input
            key={`${range.r1}:${range.c1}:${range.r2}:${range.c2}`}
            defaultValue={rangeName(range)}
            aria-label={ts("nameBox")}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              const target = parseRange(event.currentTarget.value);
              if (target) {
                select({ anchor: { row: target.r1, col: target.c1 }, focus: { row: target.r2, col: target.c2 } });
                gridRef.current?.focus();
              }
            }}
            className="h-7 w-24 shrink-0 rounded-md border border-border bg-surface px-2 font-mono text-xs focus:border-primary focus:outline-none"
          />
          <span className="font-serif text-sm italic text-muted" aria-hidden>
            fx
          </span>
          <div className="min-w-0 flex-1">
            <FormulaInput
              value={editingText}
              inputRef={barInput}
              ariaLabel={ts("formulaBar")}
              multiline={false}
              onChange={(text) => {
                if (!canEdit) return;
                if (editing) setEditing({ ...editing, text });
                else startEditing(text, "bar");
              }}
              onCommit={commitEditing}
              onCancel={cancelEditing}
              className="block h-7 w-full resize-none overflow-hidden whitespace-nowrap rounded-md bg-transparent px-1 py-1 font-mono text-xs focus:outline-none"
            />
          </div>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          {error ? (
            <p className="p-10 text-center text-muted">{message(error)}</p>
          ) : preview ? (
            <SpreadsheetViewer key={preview.id} state={preview.state} embedded />
          ) : !synced || !sheetId || !sheet || importId ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted">{importId ? t("importing") : t("loading")}</div>
          ) : (
            <Grid
              ref={gridRef}
              wb={wb}
              version={version}
              sheetId={sheetId}
              hiddenRows={hiddenRows}
              selection={selection}
              readOnly={!canEdit}
              peers={peerCursors}
              commentCells={commentCells}
              formulaRanges={formulaRanges}
              editingCell={editing?.from === "cell" ? { row: editing.row, col: editing.col } : null}
              editor={
                editing?.from === "cell" ? (
                  <FormulaInput
                    autoFocus
                    value={editing.text}
                    inputRef={cellInput}
                    ariaLabel={cellName({ row: editing.row, col: editing.col })}
                    onChange={(text) => setEditing({ ...editing, text })}
                    onCommit={commitEditing}
                    onCancel={cancelEditing}
                    className="sheet-cell-editor"
                  />
                ) : null
              }
              overlay={(geometry) => (
                <>
                  <ChartLayer
                    wb={wb}
                    version={version}
                    sheetId={sheetId}
                    geometry={geometry}
                    readOnly={!canEdit}
                    selectedId={selectedChart}
                    onSelect={setSelectedChart}
                    onEdit={(id) => {
                      setSelectedChart(id);
                      setPanel("chart");
                    }}
                    onMove={updateChart}
                  />
                  {filterRange
                    ? Array.from({ length: filterRange.c2 - filterRange.c1 + 1 }, (_, i) => {
                        const col = filterRange.c1 + i;
                        if (filterRange.r1 < geometry.frozenRows || col < geometry.frozenCols) return null;
                        const active = (sheet.filter?.hidden[sheet.cols[col]]?.length ?? 0) > 0;
                        return (
                          <button
                            key={`filter-${col}`}
                            type="button"
                            aria-label={ts("filter.title")}
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={(event) => setFilterMenu({ col, x: event.clientX, y: event.clientY + 8 })}
                            className={`absolute z-[7] flex size-[18px] items-center justify-center rounded ${active ? "bg-[var(--sheet-accent)] text-white" : "bg-white text-[#444] shadow-sm"}`}
                            style={{
                              left: geometry.colOffsets[col + 1] - geometry.frozenWidth - 20,
                              top: geometry.rowOffsets[filterRange.r1] - geometry.frozenHeight + 1,
                            }}
                          >
                            <FilterIcon className="size-3" />
                          </button>
                        );
                      })
                    : null}
                </>
              )}
              onSelect={(next) => {
                setSelectedChart(null);
                select(next);
              }}
              onCellMouseDown={editing ? onCellMouseDown : undefined}
              onDoubleClick={(pos) => {
                select({ anchor: pos, focus: pos });
                if (canEdit) setEditing({ row: pos.row, col: pos.col, text: wb.editText(sheetId, pos.row, pos.col), from: "cell" });
              }}
              onContextMenu={(target, event) => setMenu({ x: event.clientX, y: event.clientY, target })}
              onKeyDown={onGridKeyDown}
              onTextInput={canEdit ? typeIntoCell : undefined}
              onResizeCols={(c1, c2, width) => canEdit && resizeCols(wb, sheetId, c1, c2, width)}
              onResizeRows={(r1, r2, height) => canEdit && resizeRows(wb, sheetId, r1, r2, height)}
              onAutoFit={(col) => {
                if (!canEdit) return;
                const canvas = document.createElement("canvas").getContext("2d")!;
                canvas.font = "13px Arial";
                let width = 40;
                for (let r = 0; r < sheet.used.rows; r++) width = Math.max(width, canvas.measureText(wb.display(sheetId, r, col)).width + 12);
                resizeCols(wb, sheetId, col, col, Math.min(width, 600));
              }}
            />
          )}
          {!preview && sheetId ? (
            <div className="no-print flex items-center">
              <div className="min-w-0 flex-1">
                <SheetTabs
                  sheets={sheets.map((s) => ({ id: s.id, name: s.name, color: s.color }))}
                  activeId={sheetId}
                  readOnly={!canEdit}
                  onSelect={(id) => {
                    setEditing(null);
                    setActiveId(id);
                    setSelection({ anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } });
                  }}
                  onAdd={() => setActiveId(addSheet(doc, nextSheetName()))}
                  onRename={(id, name) => {
                    const duplicate = wb.sheets().some((s) => s.id !== id && s.name.toLowerCase() === name.toLowerCase());
                    if (duplicate) return void toast.error(ts("tabs.nameTaken"));
                    doc.transact(() => sheetsMap(doc).get(id)?.set("name", name), "local");
                  }}
                  onDuplicate={(id) => {
                    const source = wb.sheet(id);
                    const copy = duplicateSheet(doc, id, ts("tabs.copyOf", { name: source?.name ?? "" }));
                    if (copy) setActiveId(copy);
                  }}
                  onDelete={(id) => {
                    if (wb.sheets().length <= 1) return;
                    if (!window.confirm(ts("tabs.confirmDelete", { name: wb.sheet(id)?.name ?? "" }))) return;
                    deleteSheet(doc, id);
                  }}
                  onMove={(id, index) => moveSheet(doc, id, index)}
                />
              </div>
              {stats ? (
                <div className="hidden h-10 shrink-0 items-center gap-4 border-t border-border bg-surface-muted px-4 text-xs text-muted sm:flex">
                  <span>
                    {ts("stats.sum")}: {wb.locale === "pt" ? String(Number(stats.sum.toPrecision(12))).replace(".", ",") : Number(stats.sum.toPrecision(12))}
                  </span>
                  <span>
                    {ts("stats.average")}: {Number(stats.average.toPrecision(8)).toLocaleString(locale)}
                  </span>
                  <span>
                    {ts("stats.count")}: {stats.count}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
        </main>

        {panel === "comments" ? (
          <CommentsPanel
            api={comments}
            currentUserId={user.id}
            canComment={canComment}
            canModerate={canEdit}
            activeId={activeThread}
            onActivate={activateThread}
            draft={draft}
            onDraftDone={(id) => {
              setDraft(null);
              if (id) setActiveThread(id);
            }}
            onClose={() => setPanel(null)}
          />
        ) : null}
        {panel === "history" && canEdit ? (
          <VersionHistoryPanel
            fileId={file.id}
            selectedId={preview?.id ?? null}
            onSelect={setPreview}
            onSaveCurrent={(label) => createVersion(label || null)}
            onRestore={async () => {
              if (!preview) return;
              await createVersion(t("history.beforeRestore"));
              const versionDoc = new Y.Doc();
              Y.applyUpdate(versionDoc, preview.state);
              replaceWorkbook(doc, versionDoc);
              versionDoc.destroy();
              setPreview(null);
              toast.success(t("history.restored"));
            }}
            onClose={() => {
              setPreview(null);
              setPanel(null);
            }}
          />
        ) : null}
        {panel === "chart" && chart && selectedChart && sheetId ? (
          <ChartEditorPanel
            key={selectedChart}
            wb={wb}
            sheetId={sheetId}
            chart={chart}
            onChange={(patch) => updateChart(selectedChart, patch)}
            onDelete={() => {
              if (sheet) doc.transact(() => sheetCharts(sheet.map).delete(selectedChart), "local");
              setSelectedChart(null);
              setPanel(null);
            }}
            onClose={() => setPanel(null)}
          />
        ) : null}
      </div>

      {menu && sheetId ? (
        <ContextMenu
          position={menu}
          target={menu.target}
          canEdit={canEdit}
          canComment={canComment}
          actions={contextActions(menu.target)}
          onClose={() => {
            setMenu(null);
            gridRef.current?.focus();
          }}
        />
      ) : null}
      {filterMenu && filterRange && sheet && sheetId ? (
        <FilterMenu
          wb={wb}
          sheetId={sheetId}
          col={filterMenu.col}
          rows={[filterRange.r1 + 1, filterRange.r2]}
          hidden={sheet.filter?.hidden[sheet.cols[filterMenu.col]] ?? []}
          position={{ x: filterMenu.x, y: filterMenu.y }}
          onSort={(ascending) => {
            sortRange(wb, sheetId, { r1: filterRange.r1, c1: filterRange.c1, r2: filterRange.r2, c2: filterRange.c2 }, filterMenu.col, ascending, true);
            setFilterMenu(null);
          }}
          onApply={(hidden) => {
            setFilterHidden(wb, sheetId, sheet.cols[filterMenu.col], hidden);
            setFilterMenu(null);
          }}
          onClose={() => setFilterMenu(null)}
        />
      ) : null}
      <span className="sr-only" aria-live="polite">
        {cellName(selection.anchor)} {sheetId ? wb.display(sheetId, selection.anchor.row, selection.anchor.col) : ""}
      </span>
    </div>
  );
}
