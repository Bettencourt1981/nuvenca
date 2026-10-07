import * as Y from "yjs";
import { newId } from "./ids";

/**
 * Spreadsheet data model on Yjs. Rows and columns have stable ids; cells are
 * keyed by "rowId:colId". Inserting, deleting or sorting rows only changes the
 * order arrays, so concurrent edits from several people merge cleanly.
 *
 *   doc.sheetOrder : Y.Array<sheetId>
 *   doc.sheets     : Y.Map<sheetId, Y.Map>
 *     name, color?, frozenRows, frozenCols, filter?
 *     rows  : Y.Array<rowId>          cols : Y.Array<colId>
 *     cells : Y.Map<"row:col", Cell>
 *     rowHeights / colWidths : Y.Map<id, px>
 *     merges : Y.Map<id, Merge>        charts : Y.Map<id, Chart>
 */

export type HAlign = "left" | "center" | "right";
export type VAlign = "top" | "middle" | "bottom";
export type BorderSide = { style: "thin" | "medium" | "thick" | "dashed"; color: string };

export type CellStyle = {
  b?: boolean; // bold
  i?: boolean; // italic
  u?: boolean; // underline
  st?: boolean; // strikethrough
  fc?: string; // font colour
  bg?: string; // fill colour
  fs?: number; // font size (pt)
  ff?: string; // font family
  ha?: HAlign;
  va?: VAlign;
  wrap?: boolean;
  nf?: string; // number format (Excel pattern)
  bt?: BorderSide;
  br?: BorderSide;
  bb?: BorderSide;
  bl?: BorderSide;
};

export type Cell = {
  /** Literal value (numbers stay numbers). */
  v?: string | number | boolean;
  /** Formula in internal notation, without "=". */
  f?: string;
  s?: CellStyle;
};

export type Merge = { r1: string; c1: string; r2: string; c2: string };

export type ChartType = "column" | "bar" | "line" | "area" | "pie" | "scatter";
export type Chart = {
  type: ChartType;
  title?: string;
  /** Data range by ids. */
  range: { r1: string; c1: string; r2: string; c2: string };
  /** Top-left anchor cell and size in px. */
  anchor: { rowId: string; colId: string; dx: number; dy: number };
  width: number;
  height: number;
  /** First row holds series names; first column holds categories. */
  headers?: boolean;
};

export type FilterState = {
  range: { r1: string; c1: string; r2: string; c2: string };
  /** colId → hidden values (as displayed text). */
  hidden: Record<string, string[]>;
  sort?: { colId: string; ascending: boolean };
};

export const DEFAULT_ROWS = 1000;
export const DEFAULT_COLS = 26;
export const DEFAULT_ROW_HEIGHT = 21;
export const DEFAULT_COL_WIDTH = 100;
export const MAX_ROWS = 100_000;
export const MAX_COLS = 702; // ZZ

export const cellKey = (rowId: string, colId: string) => `${rowId}:${colId}`;

export type SheetMap = Y.Map<unknown>;

export function sheetOrder(doc: Y.Doc) {
  return doc.getArray<string>("sheetOrder");
}

export function sheetsMap(doc: Y.Doc) {
  return doc.getMap<SheetMap>("sheets");
}

export const sheetRows = (sheet: SheetMap) => sheet.get("rows") as Y.Array<string>;
export const sheetCols = (sheet: SheetMap) => sheet.get("cols") as Y.Array<string>;
export const sheetCells = (sheet: SheetMap) => sheet.get("cells") as Y.Map<Cell>;
export const rowHeights = (sheet: SheetMap) => sheet.get("rowHeights") as Y.Map<number>;
export const colWidths = (sheet: SheetMap) => sheet.get("colWidths") as Y.Map<number>;
export const sheetMerges = (sheet: SheetMap) => sheet.get("merges") as Y.Map<Merge>;
export const sheetCharts = (sheet: SheetMap) => sheet.get("charts") as Y.Map<Chart>;

function ids(count: number) {
  return Array.from({ length: count }, () => newId());
}

/** Build a sheet (not yet attached to a document). */
export function buildSheet(name: string, rows = DEFAULT_ROWS, cols = DEFAULT_COLS): SheetMap {
  const sheet = new Y.Map<unknown>();
  sheet.set("name", name);
  sheet.set("frozenRows", 0);
  sheet.set("frozenCols", 0);
  const rowArray = new Y.Array<string>();
  rowArray.push(ids(rows));
  const colArray = new Y.Array<string>();
  colArray.push(ids(cols));
  sheet.set("rows", rowArray);
  sheet.set("cols", colArray);
  sheet.set("cells", new Y.Map<Cell>());
  sheet.set("rowHeights", new Y.Map<number>());
  sheet.set("colWidths", new Y.Map<number>());
  sheet.set("merges", new Y.Map<Merge>());
  sheet.set("charts", new Y.Map<Chart>());
  return sheet;
}

/** A new workbook with one empty sheet. Returns the sheet id. */
export function initWorkbook(doc: Y.Doc, sheetName: string): string {
  const id = newId(8);
  doc.transact(() => {
    sheetsMap(doc).set(id, buildSheet(sheetName));
    sheetOrder(doc).push([id]);
  });
  return id;
}

export function addSheet(doc: Y.Doc, name: string, index?: number): string {
  const id = newId(8);
  doc.transact(() => {
    sheetsMap(doc).set(id, buildSheet(name));
    const order = sheetOrder(doc);
    order.insert(Math.min(index ?? order.length, order.length), [id]);
  });
  return id;
}

export function deleteSheet(doc: Y.Doc, id: string) {
  doc.transact(() => {
    const order = sheetOrder(doc);
    const index = order.toArray().indexOf(id);
    if (index >= 0) order.delete(index, 1);
    sheetsMap(doc).delete(id);
  });
}

export function moveSheet(doc: Y.Doc, id: string, toIndex: number) {
  doc.transact(() => {
    const order = sheetOrder(doc);
    const index = order.toArray().indexOf(id);
    if (index < 0) return;
    order.delete(index, 1);
    order.insert(Math.max(0, Math.min(toIndex, order.length)), [id]);
  });
}

/** Copy a sheet (cells, sizes, merges, charts) under a new name. */
export function duplicateSheet(doc: Y.Doc, id: string, name: string): string | null {
  const source = sheetsMap(doc).get(id);
  if (!source) return null;
  const copyId = newId(8);
  doc.transact(() => {
    const rows = sheetRows(source).toArray();
    const cols = sheetCols(source).toArray();
    const sheet = buildSheet(name, 0, 0);
    sheet.set("frozenRows", source.get("frozenRows") ?? 0);
    sheet.set("frozenCols", source.get("frozenCols") ?? 0);
    // Same ids are fine: they are scoped to the sheet.
    sheetRows(sheet).push(rows);
    sheetCols(sheet).push(cols);
    sheetCells(source).forEach((cell, key) => sheetCells(sheet).set(key, { ...cell, s: cell.s ? { ...cell.s } : undefined }));
    rowHeights(source).forEach((h, k) => rowHeights(sheet).set(k, h));
    colWidths(source).forEach((w, k) => colWidths(sheet).set(k, w));
    sheetMerges(source).forEach((m, k) => sheetMerges(sheet).set(k, { ...m }));
    sheetCharts(source).forEach((c) => sheetCharts(sheet).set(newId(), structuredClone(c)));
    sheetsMap(doc).set(copyId, sheet);
    const order = sheetOrder(doc);
    order.insert(order.toArray().indexOf(id) + 1, [copyId]);
  });
  return copyId;
}

export function insertRows(sheet: SheetMap, index: number, count: number) {
  sheetRows(sheet).insert(Math.min(index, sheetRows(sheet).length), ids(count));
}

export function insertCols(sheet: SheetMap, index: number, count: number) {
  sheetCols(sheet).insert(Math.min(index, sheetCols(sheet).length), ids(count));
}

export function deleteRows(sheet: SheetMap, index: number, count: number) {
  const rows = sheetRows(sheet);
  const removed = new Set(rows.slice(index, index + count));
  rows.delete(index, Math.min(count, rows.length - index));
  const cells = sheetCells(sheet);
  for (const key of Array.from(cells.keys())) if (removed.has(key.slice(0, key.indexOf(":")))) cells.delete(key);
  removed.forEach((id) => rowHeights(sheet).delete(id));
  sheetMerges(sheet).forEach((m, key) => {
    if (removed.has(m.r1) || removed.has(m.r2)) sheetMerges(sheet).delete(key);
  });
}

export function deleteCols(sheet: SheetMap, index: number, count: number) {
  const cols = sheetCols(sheet);
  const removed = new Set(cols.slice(index, index + count));
  cols.delete(index, Math.min(count, cols.length - index));
  const cells = sheetCells(sheet);
  for (const key of Array.from(cells.keys())) if (removed.has(key.slice(key.indexOf(":") + 1))) cells.delete(key);
  removed.forEach((id) => colWidths(sheet).delete(id));
  sheetMerges(sheet).forEach((m, key) => {
    if (removed.has(m.c1) || removed.has(m.c2)) sheetMerges(sheet).delete(key);
  });
}

/** Make sure the sheet has at least this many rows and columns. */
export function ensureSize(sheet: SheetMap, rows: number, cols: number) {
  const rowArray = sheetRows(sheet);
  const colArray = sheetCols(sheet);
  if (rowArray.length < rows) rowArray.push(ids(Math.min(rows, MAX_ROWS) - rowArray.length));
  if (colArray.length < cols) colArray.push(ids(Math.min(cols, MAX_COLS) - colArray.length));
}

/** Reorder the rows between r1 and r2 (inclusive) to `order` (row ids). */
export function reorderRows(sheet: SheetMap, r1: number, order: string[]) {
  const rows = sheetRows(sheet);
  rows.delete(r1, order.length);
  rows.insert(r1, order);
}

/**
 * Replace the whole workbook with a copy of another document's (restoring a
 * version, importing a file). Yjs types can't move between documents, so the
 * content is rebuilt.
 */
export function replaceWorkbook(target: Y.Doc, source: Y.Doc, origin: unknown = "local") {
  target.transact(() => {
    const order = sheetOrder(target);
    const sheets = sheetsMap(target);
    order.delete(0, order.length);
    for (const key of Array.from(sheets.keys())) sheets.delete(key);
    for (const id of sheetOrder(source).toArray()) {
      const from = sheetsMap(source).get(id);
      if (!from) continue;
      // Attached first: Yjs types can only be read once they belong to a document.
      const sheet = buildSheet(String(from.get("name") ?? "Sheet"), 0, 0);
      sheets.set(id, sheet);
      order.push([id]);
      for (const key of ["frozenRows", "frozenCols", "color", "filter"]) {
        const value = from.get(key);
        if (value !== undefined) sheet.set(key, structuredClone(value));
      }
      sheetRows(sheet).push(sheetRows(from).toArray());
      sheetCols(sheet).push(sheetCols(from).toArray());
      sheetCells(from).forEach((cell, key) => sheetCells(sheet).set(key, structuredClone(cell)));
      rowHeights(from).forEach((h, k) => rowHeights(sheet).set(k, h));
      colWidths(from).forEach((w, k) => colWidths(sheet).set(k, w));
      sheetMerges(from).forEach((m, k) => sheetMerges(sheet).set(k, { ...m }));
      sheetCharts(from).forEach((c, k) => sheetCharts(sheet).set(k, structuredClone(c)));
    }
  }, origin);
}
