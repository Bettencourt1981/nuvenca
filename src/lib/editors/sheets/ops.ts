import { rangeName, normalize, type RangePos } from "./address";
import { compareValues } from "./formula/evaluate";
import { shiftFormula } from "./formula/refs";
import { isError } from "./formula/values";
import { parseInput, editableValue } from "./format";
import type { Workbook } from "./engine";
import { newId } from "./ids";
import {
  cellKey,
  colWidths,
  deleteCols,
  deleteRows,
  ensureSize,
  insertCols,
  insertRows,
  rowHeights,
  sheetCells,
  sheetMerges,
  type BorderSide,
  type Cell,
  type CellStyle,
  type FilterState,
} from "./model";

/** All spreadsheet edits go through these, inside one Yjs transaction each. */

const ORIGIN = "local";

function transact(wb: Workbook, fn: () => void) {
  wb.doc.transact(fn, ORIGIN);
}

function keyAt(wb: Workbook, sheetId: string, row: number, col: number): string | null {
  const sheet = wb.sheet(sheetId);
  if (!sheet) return null;
  if (row >= sheet.rows.length || col >= sheet.cols.length) {
    ensureSize(sheet.map, row + 1, col + 1);
    wb.invalidate();
  }
  const fresh = wb.sheet(sheetId)!;
  return cellKey(fresh.rows[row], fresh.cols[col]);
}

function writeCell(wb: Workbook, sheetId: string, key: string, cell: Cell | undefined) {
  const cells = sheetCells(wb.sheet(sheetId)!.map);
  const empty = !cell || (cell.v === undefined && cell.f === undefined && (!cell.s || Object.keys(cell.s).length === 0));
  if (empty) cells.delete(key);
  else cells.set(key, cell);
}

/** Apply what someone typed (or pasted as text) to a cell. */
function applyInput(wb: Workbook, sheetId: string, row: number, col: number, text: string) {
  const key = keyAt(wb, sheetId, row, col);
  if (!key) return;
  const existing = sheetCells(wb.sheet(sheetId)!.map).get(key);
  const style = existing?.s;
  const parsed = parseInput(text, wb.locale);
  if (parsed.kind === "empty") {
    writeCell(wb, sheetId, key, style ? { s: style } : undefined);
  } else if (parsed.kind === "formula") {
    writeCell(wb, sheetId, key, { f: wb.formulaFromA1(sheetId, parsed.formula), s: style });
  } else {
    const nf = style?.nf ?? parsed.format;
    writeCell(wb, sheetId, key, { v: parsed.value, s: nf ? { ...style, nf } : style });
  }
}

export function setCellInput(wb: Workbook, sheetId: string, row: number, col: number, text: string) {
  transact(wb, () => applyInput(wb, sheetId, row, col, text));
}

export function clearRange(wb: Workbook, sheetId: string, range: RangePos, options: { formats?: boolean } = {}) {
  const { r1, c1, r2, c2 } = normalize(range);
  transact(wb, () => {
    const sheet = wb.sheet(sheetId);
    if (!sheet) return;
    const cells = sheetCells(sheet.map);
    for (let r = r1; r <= Math.min(r2, sheet.rows.length - 1); r++) {
      for (let c = c1; c <= Math.min(c2, sheet.cols.length - 1); c++) {
        const key = cellKey(sheet.rows[r], sheet.cols[c]);
        const cell = cells.get(key);
        if (!cell) continue;
        if (options.formats || !cell.s) cells.delete(key);
        else cells.set(key, { s: cell.s });
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function updateStyle(
  wb: Workbook,
  sheetId: string,
  range: RangePos,
  patch: (style: CellStyle) => CellStyle,
) {
  const { r1, c1, r2, c2 } = normalize(range);
  transact(wb, () => {
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const key = keyAt(wb, sheetId, r, c);
        if (!key) continue;
        const cells = sheetCells(wb.sheet(sheetId)!.map);
        const cell = cells.get(key) ?? {};
        const next = patch({ ...(cell.s ?? {}) });
        for (const k of Object.keys(next) as (keyof CellStyle)[]) if (next[k] === undefined) delete next[k];
        writeCell(wb, sheetId, key, { ...cell, s: Object.keys(next).length ? next : undefined });
      }
    }
  });
}

export function setStyle(wb: Workbook, sheetId: string, range: RangePos, values: Partial<CellStyle>) {
  updateStyle(wb, sheetId, range, (style) => ({ ...style, ...values }));
}

export type BorderMode = "all" | "outer" | "inner" | "top" | "bottom" | "left" | "right" | "none";

export function setBorders(wb: Workbook, sheetId: string, range: RangePos, mode: BorderMode, color = "#000000") {
  const { r1, c1, r2, c2 } = normalize(range);
  const side: BorderSide = { style: "thin", color };
  transact(wb, () => {
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        updateStyle(wb, sheetId, { r1: r, c1: c, r2: r, c2: c }, (s) => {
          if (mode === "none") return { ...s, bt: undefined, br: undefined, bb: undefined, bl: undefined };
          const all = mode === "all";
          const inner = mode === "inner";
          return {
            ...s,
            bt: all || (mode === "outer" && r === r1) || mode === "top" && r === r1 || (inner && r > r1) ? side : s.bt,
            bb: all || (mode === "outer" && r === r2) || (mode === "bottom" && r === r2) || (inner && r < r2) ? side : s.bb,
            bl: all || (mode === "outer" && c === c1) || (mode === "left" && c === c1) || (inner && c > c1) ? side : s.bl,
            br: all || (mode === "outer" && c === c2) || (mode === "right" && c === c2) || (inner && c < c2) ? side : s.br,
          };
        });
      }
    }
  });
}

export function mergeCells(wb: Workbook, sheetId: string, range: RangePos) {
  const { r1, c1, r2, c2 } = normalize(range);
  if (r1 === r2 && c1 === c2) return;
  transact(wb, () => {
    const sheet = wb.sheet(sheetId)!;
    const merges = sheetMerges(sheet.map);
    // Drop overlapping merges, keep only the top-left value.
    for (const m of sheet.merges) if (!(m.r2 < r1 || m.r1 > r2 || m.c2 < c1 || m.c1 > c2)) merges.delete(m.key);
    const cells = sheetCells(sheet.map);
    for (let r = r1; r <= r2; r++)
      for (let c = c1; c <= c2; c++) {
        if (r === r1 && c === c1) continue;
        const key = cellKey(sheet.rows[r], sheet.cols[c]);
        const cell = cells.get(key);
        if (cell?.v !== undefined || cell?.f !== undefined) writeCell(wb, sheetId, key, cell.s ? { s: cell.s } : undefined);
      }
    merges.set(newId(), { r1: sheet.rows[r1], c1: sheet.cols[c1], r2: sheet.rows[r2], c2: sheet.cols[c2] });
  });
}

export function unmergeCells(wb: Workbook, sheetId: string, range: RangePos) {
  const { r1, c1, r2, c2 } = normalize(range);
  transact(wb, () => {
    const sheet = wb.sheet(sheetId)!;
    for (const m of sheet.merges) if (!(m.r2 < r1 || m.r1 > r2 || m.c2 < c1 || m.c1 > c2)) sheetMerges(sheet.map).delete(m.key);
  });
}

// ---------------------------------------------------------------------------
// Rows & columns
// ---------------------------------------------------------------------------

export function insertRowsAt(wb: Workbook, sheetId: string, index: number, count = 1) {
  transact(wb, () => insertRows(wb.sheet(sheetId)!.map, index, count));
}
export function insertColsAt(wb: Workbook, sheetId: string, index: number, count = 1) {
  transact(wb, () => insertCols(wb.sheet(sheetId)!.map, index, count));
}
export function deleteRowsAt(wb: Workbook, sheetId: string, index: number, count = 1) {
  transact(wb, () => {
    const sheet = wb.sheet(sheetId)!;
    // Keep at least one row.
    deleteRows(sheet.map, index, Math.min(count, sheet.rows.length - 1));
  });
}
export function deleteColsAt(wb: Workbook, sheetId: string, index: number, count = 1) {
  transact(wb, () => {
    const sheet = wb.sheet(sheetId)!;
    deleteCols(sheet.map, index, Math.min(count, sheet.cols.length - 1));
  });
}

export function resizeCols(wb: Workbook, sheetId: string, c1: number, c2: number, width: number) {
  transact(wb, () => {
    const sheet = wb.sheet(sheetId)!;
    for (let c = c1; c <= c2; c++) colWidths(sheet.map).set(sheet.cols[c], Math.max(20, Math.round(width)));
  });
}
export function resizeRows(wb: Workbook, sheetId: string, r1: number, r2: number, height: number) {
  transact(wb, () => {
    const sheet = wb.sheet(sheetId)!;
    for (let r = r1; r <= r2; r++) rowHeights(sheet.map).set(sheet.rows[r], Math.max(14, Math.round(height)));
  });
}

export function setFrozen(wb: Workbook, sheetId: string, rows: number, cols: number) {
  transact(wb, () => {
    const map = wb.sheet(sheetId)!.map;
    map.set("frozenRows", Math.max(0, rows));
    map.set("frozenCols", Math.max(0, cols));
  });
}

// ---------------------------------------------------------------------------
// Copy, paste, fill
// ---------------------------------------------------------------------------

export type ClipCell = { text: string; style?: CellStyle };
export type Clip = { origin: { row: number; col: number }; rows: ClipCell[][]; tsv: string };

/** Copy formulas in A1 form (shifted on paste) plus styles. */
export function copyRange(wb: Workbook, sheetId: string, range: RangePos): Clip {
  const { r1, c1, r2, c2 } = normalize(range);
  const rows: ClipCell[][] = [];
  const lines: string[] = [];
  for (let r = r1; r <= r2; r++) {
    const row: ClipCell[] = [];
    const texts: string[] = [];
    for (let c = c1; c <= c2; c++) {
      const cell = wb.cell(sheetId, r, c);
      row.push({ text: wb.editText(sheetId, r, c), style: cell?.s ? { ...cell.s } : undefined });
      texts.push(wb.display(sheetId, r, c).replace(/\t|\n/g, " "));
    }
    rows.push(row);
    lines.push(texts.join("\t"));
  }
  return { origin: { row: r1, col: c1 }, rows, tsv: lines.join("\n") };
}

export function pasteClip(wb: Workbook, sheetId: string, at: { row: number; col: number }, clip: Clip, target?: RangePos) {
  const height = clip.rows.length;
  const width = clip.rows[0]?.length ?? 0;
  // Pasting a single cell into a larger selection fills the selection.
  const area = target ? normalize(target) : null;
  const repeatRows = area && height === 1 ? area.r2 - area.r1 + 1 : height;
  const repeatCols = area && width === 1 ? area.c2 - area.c1 + 1 : width;
  transact(wb, () => {
    for (let dr = 0; dr < repeatRows; dr++) {
      for (let dc = 0; dc < repeatCols; dc++) {
        const source = clip.rows[dr % height][dc % width];
        const row = at.row + dr;
        const col = at.col + dc;
        const text = source.text.startsWith("=")
          ? `=${shiftFormula(source.text.slice(1), row - (clip.origin.row + (dr % height)), col - (clip.origin.col + (dc % width)))}`
          : source.text;
        applyInput(wb, sheetId, row, col, text);
        const key = keyAt(wb, sheetId, row, col)!;
        const cells = sheetCells(wb.sheet(sheetId)!.map);
        const cell = cells.get(key);
        writeCell(wb, sheetId, key, { ...cell, s: source.style });
      }
    }
  });
}

/** Paste plain text (tab separated, e.g. from another spreadsheet). */
export function pasteText(wb: Workbook, sheetId: string, at: { row: number; col: number }, text: string) {
  const rows = text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n").map((line) => line.split("\t"));
  transact(wb, () => {
    rows.forEach((values, dr) => values.forEach((value, dc) => applyInput(wb, sheetId, at.row + dr, at.col + dc, value)));
  });
  return { rows: rows.length, cols: Math.max(...rows.map((r) => r.length)) };
}

/** Ctrl+D / Ctrl+R: copy the first row/column of the selection across it. */
export function fill(wb: Workbook, sheetId: string, range: RangePos, direction: "down" | "right") {
  const { r1, c1, r2, c2 } = normalize(range);
  const source = direction === "down" ? { r1, c1, r2: r1, c2 } : { r1, c1, r2, c2: c1 };
  const clip = copyRange(wb, sheetId, source);
  if (direction === "down" && r2 > r1) pasteClip(wb, sheetId, { row: r1 + 1, col: c1 }, clip, { r1: r1 + 1, c1, r2, c2 });
  if (direction === "right" && c2 > c1) pasteClip(wb, sheetId, { row: r1, col: c1 + 1 }, clip, { r1, c1: c1 + 1, r2, c2 });
}

// ---------------------------------------------------------------------------
// Sort & filter
// ---------------------------------------------------------------------------

/**
 * Sort the rows of a range by one column. Like Excel and Google Sheets, the cell
 * contents move (only within the range's columns); formulas elsewhere that point
 * at the range keep pointing at the same cells, and relative references inside
 * moved formulas shift with them.
 */
export function sortRange(wb: Workbook, sheetId: string, range: RangePos, col: number, ascending: boolean, hasHeader = false) {
  const { r1, c1, r2, c2 } = normalize(range);
  const start = hasHeader ? r1 + 1 : r1;
  const sheet = wb.sheet(sheetId);
  if (!sheet || r2 <= start) return;
  const lastCol = Math.min(c2, Math.max(sheet.used.cols - 1, c1));
  const lastRow = Math.min(r2, Math.max(sheet.used.rows - 1, start));
  const rows = Array.from({ length: lastRow - start + 1 }, (_, i) => ({ row: start + i, value: wb.value(sheetId, start + i, col) }));
  rows.sort((a, b) => {
    // Blanks always last, then Excel ordering.
    if (a.value === null || a.value === "") return b.value === null || b.value === "" ? 0 : 1;
    if (b.value === null || b.value === "") return -1;
    if (isError(a.value) || isError(b.value)) return isError(a.value) ? 1 : -1;
    const c = compareValues(a.value, b.value);
    return ascending ? c : -c;
  });
  if (rows.every((r, i) => r.row === start + i)) return;
  transact(wb, () => {
    const moved: { key: string; cell: Cell | undefined }[] = [];
    rows.forEach(({ row: from }, i) => {
      const to = start + i;
      for (let c = c1; c <= lastCol; c++) {
        const source = wb.cell(sheetId, from, c);
        const cell: Cell | undefined = source ? structuredClone(source) : undefined;
        if (cell?.f !== undefined && to !== from) {
          cell.f = wb.formulaFromA1(sheetId, shiftFormula(wb.formulaToA1(sheetId, cell.f), to - from, 0));
        }
        moved.push({ key: cellKey(sheet.rows[to], sheet.cols[c]), cell });
      }
    });
    for (const { key, cell } of moved) writeCell(wb, sheetId, key, cell);
  });
}

export function setFilter(wb: Workbook, sheetId: string, range: RangePos | null) {
  transact(wb, () => {
    const sheet = wb.sheet(sheetId)!;
    if (!range) {
      sheet.map.delete("filter");
      return;
    }
    const { r1, c1, r2, c2 } = normalize(range);
    const filter: FilterState = {
      range: { r1: sheet.rows[r1], c1: sheet.cols[c1], r2: sheet.rows[r2], c2: sheet.cols[c2] },
      hidden: {},
    };
    sheet.map.set("filter", filter);
  });
}

export function setFilterHidden(wb: Workbook, sheetId: string, colId: string, hidden: string[]) {
  transact(wb, () => {
    const sheet = wb.sheet(sheetId)!;
    const filter = sheet.filter;
    if (!filter) return;
    const next: FilterState = { ...filter, hidden: { ...filter.hidden, [colId]: hidden } };
    if (hidden.length === 0) delete next.hidden[colId];
    sheet.map.set("filter", next);
  });
}

/** Detect the data region around a cell (for filters/charts without a selection). */
export function currentRegion(wb: Workbook, sheetId: string, row: number, col: number): RangePos {
  const sheet = wb.sheet(sheetId)!;
  const filled = (r: number, c: number) => {
    const cell = wb.cell(sheetId, r, c);
    return cell?.v !== undefined || cell?.f !== undefined;
  };
  let r1 = row, r2 = row, c1 = col, c2 = col;
  let grew = true;
  while (grew) {
    grew = false;
    if (r1 > 0 && Array.from({ length: c2 - c1 + 1 }, (_, i) => filled(r1 - 1, c1 + i)).some(Boolean)) { r1--; grew = true; }
    if (r2 < sheet.rows.length - 1 && Array.from({ length: c2 - c1 + 1 }, (_, i) => filled(r2 + 1, c1 + i)).some(Boolean)) { r2++; grew = true; }
    if (c1 > 0 && Array.from({ length: r2 - r1 + 1 }, (_, i) => filled(r1 + i, c1 - 1)).some(Boolean)) { c1--; grew = true; }
    if (c2 < sheet.cols.length - 1 && Array.from({ length: r2 - r1 + 1 }, (_, i) => filled(r1 + i, c2 + 1)).some(Boolean)) { c2++; grew = true; }
  }
  return { r1, c1, r2, c2 };
}

/** Rows hidden by the sheet's filter. */
export function filteredRows(wb: Workbook, sheetId: string): Set<number> {
  const sheet = wb.sheet(sheetId);
  const hidden = new Set<number>();
  const filter = sheet?.filter;
  if (!sheet || !filter) return hidden;
  const r1 = sheet.rowIndex.get(filter.range.r1);
  const r2 = sheet.rowIndex.get(filter.range.r2);
  if (r1 === undefined || r2 === undefined) return hidden;
  const rules = Object.entries(filter.hidden)
    .map(([colId, values]) => ({ col: sheet.colIndex.get(colId), values: new Set(values) }))
    .filter((rule): rule is { col: number; values: Set<string> } => rule.col !== undefined && rule.values.size > 0);
  if (rules.length === 0) return hidden;
  for (let r = r1 + 1; r <= r2; r++) {
    if (rules.some((rule) => rule.values.has(wb.display(sheetId, r, rule.col)))) hidden.add(r);
  }
  return hidden;
}

/** A1 address of a range, for the name box and chart editor. */
export const describeRange = (range: RangePos) => rangeName(range);

export { editableValue };
