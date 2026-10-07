import * as Y from "yjs";
import { parseFormula, type Node } from "./formula/parse";
import { evaluateCell, type EvalContext } from "./formula/evaluate";
import { toDisplay, toInternal } from "./formula/refs";
import type { IdRef } from "./formula/tokenize";
import { err, type Scalar } from "./formula/values";
import { displayValue, editableValue } from "./format";
import {
  DEFAULT_COL_WIDTH,
  DEFAULT_ROW_HEIGHT,
  cellKey,
  colWidths,
  ensureSize,
  rowHeights,
  sheetCells,
  sheetCharts,
  sheetCols,
  sheetMerges,
  sheetOrder,
  sheetRows,
  sheetsMap,
  type Cell,
  type Chart,
  type FilterState,
  type SheetMap,
} from "./model";

export type MergeArea = { r1: number; c1: number; r2: number; c2: number; key: string };

/** Index of one sheet, rebuilt whenever the document changes. */
export type SheetIndex = {
  id: string;
  name: string;
  color?: string;
  map: SheetMap;
  rows: string[];
  cols: string[];
  rowIndex: Map<string, number>;
  colIndex: Map<string, number>;
  cells: Y.Map<Cell>;
  frozenRows: number;
  frozenCols: number;
  heights: number[];
  widths: number[];
  merges: MergeArea[];
  /** Cells covered by a merge (not its top-left) → the merge. */
  covered: Map<string, MergeArea>;
  used: { rows: number; cols: number };
  filter: FilterState | null;
  charts: [string, Chart][];
};

const parsedCache = new Map<string, Node | null>();

function parsed(formula: string): Node | null {
  let node = parsedCache.get(formula);
  if (node === undefined) {
    node = parseFormula(formula);
    if (parsedCache.size > 5000) parsedCache.clear();
    parsedCache.set(formula, node);
  }
  return node;
}

/**
 * Read model + calculation engine over the Yjs document. Values are computed
 * lazily and memoised until the next change.
 */
export class Workbook {
  private indexes: Map<string, SheetIndex> | null = null;
  private values = new Map<string, Scalar>();
  private computing = new Set<string>();
  private now = new Date();

  constructor(
    readonly doc: Y.Doc,
    public locale: string,
  ) {}

  /** Call after every document change. */
  invalidate() {
    this.indexes = null;
    this.values.clear();
    this.now = new Date();
  }

  // ---------------------------------------------------------------------------
  // Structure
  // ---------------------------------------------------------------------------

  private build(): Map<string, SheetIndex> {
    if (this.indexes) return this.indexes;
    const indexes = new Map<string, SheetIndex>();
    const sheets = sheetsMap(this.doc);
    for (const id of sheetOrder(this.doc).toArray()) {
      const map = sheets.get(id);
      if (!map || indexes.has(id)) continue;
      const rows = sheetRows(map).toArray();
      const cols = sheetCols(map).toArray();
      const rowIndex = new Map(rows.map((rid, i) => [rid, i]));
      const colIndex = new Map(cols.map((cid, i) => [cid, i]));
      const heightsMap = rowHeights(map);
      const widthsMap = colWidths(map);
      const cells = sheetCells(map);
      let usedRows = 0;
      let usedCols = 0;
      cells.forEach((cell, key) => {
        if (cell.v === undefined && cell.f === undefined) return;
        const split = key.indexOf(":");
        const r = rowIndex.get(key.slice(0, split));
        const c = colIndex.get(key.slice(split + 1));
        if (r === undefined || c === undefined) return;
        if (r + 1 > usedRows) usedRows = r + 1;
        if (c + 1 > usedCols) usedCols = c + 1;
      });
      const merges: MergeArea[] = [];
      const covered = new Map<string, MergeArea>();
      sheetMerges(map).forEach((m, key) => {
        const area = {
          r1: rowIndex.get(m.r1) ?? -1,
          c1: colIndex.get(m.c1) ?? -1,
          r2: rowIndex.get(m.r2) ?? -1,
          c2: colIndex.get(m.c2) ?? -1,
          key,
        };
        if (area.r1 < 0 || area.c1 < 0 || area.r2 < area.r1 || area.c2 < area.c1) return;
        merges.push(area);
        for (let r = area.r1; r <= area.r2; r++)
          for (let c = area.c1; c <= area.c2; c++) if (r !== area.r1 || c !== area.c1) covered.set(`${r}:${c}`, area);
      });
      indexes.set(id, {
        id,
        name: String(map.get("name") ?? "Sheet"),
        color: (map.get("color") as string | undefined) ?? undefined,
        map,
        rows,
        cols,
        rowIndex,
        colIndex,
        cells,
        frozenRows: Math.min(Number(map.get("frozenRows") ?? 0), rows.length),
        frozenCols: Math.min(Number(map.get("frozenCols") ?? 0), cols.length),
        heights: rows.map((rid) => heightsMap.get(rid) ?? DEFAULT_ROW_HEIGHT),
        widths: cols.map((cid) => widthsMap.get(cid) ?? DEFAULT_COL_WIDTH),
        merges,
        covered,
        used: { rows: usedRows, cols: usedCols },
        filter: (map.get("filter") as FilterState | undefined) ?? null,
        charts: Array.from(sheetCharts(map).entries()),
      });
    }
    this.indexes = indexes;
    return indexes;
  }

  sheets(): SheetIndex[] {
    return Array.from(this.build().values());
  }

  sheet(id: string): SheetIndex | undefined {
    return this.build().get(id);
  }

  sheetIdByName(name: string): string | null {
    const lower = name.toLowerCase();
    return this.sheets().find((s) => s.name.toLowerCase() === lower)?.id ?? null;
  }

  cell(sheetId: string, row: number, col: number): Cell | undefined {
    const sheet = this.sheet(sheetId);
    const rowId = sheet?.rows[row];
    const colId = sheet?.cols[col];
    if (!sheet || !rowId || !colId) return undefined;
    return sheet.cells.get(cellKey(rowId, colId));
  }

  // ---------------------------------------------------------------------------
  // Calculation
  // ---------------------------------------------------------------------------

  value(sheetId: string, row: number, col: number): Scalar {
    const key = `${sheetId}:${row}:${col}`;
    const cached = this.values.get(key);
    if (cached !== undefined) return cached;
    const cell = this.cell(sheetId, row, col);
    let result: Scalar;
    if (!cell) result = null;
    else if (cell.f !== undefined) {
      if (this.computing.has(key)) return err("#CIRC!");
      this.computing.add(key);
      try {
        const node = parsed(cell.f);
        result = node ? evaluateCell(node, this.context(sheetId, row, col)) : err("#ERROR!");
      } catch {
        result = err("#ERROR!");
      } finally {
        this.computing.delete(key);
      }
    } else result = cell.v ?? null;
    this.values.set(key, result);
    return result;
  }

  private context(sheetId: string, row: number, col: number): EvalContext {
    return {
      sheetId,
      row,
      col,
      locale: this.locale,
      now: () => this.now,
      resolve: (ref: IdRef) => {
        const id = ref.sheetId ?? sheetId;
        const sheet = this.sheet(id);
        if (!sheet) return null;
        const r = ref.rowId === undefined ? undefined : sheet.rowIndex.get(ref.rowId);
        const c = ref.colId === undefined ? undefined : sheet.colIndex.get(ref.colId);
        if ((ref.rowId !== undefined && r === undefined) || (ref.colId !== undefined && c === undefined)) return null;
        return { sheetId: id, row: r, col: c };
      },
      cellValue: (id, r, c) => this.value(id, r, c),
      usedSize: (id) => this.sheet(id)?.used ?? { rows: 0, cols: 0 },
    };
  }

  /** Formatted text for display in the grid. */
  display(sheetId: string, row: number, col: number): string {
    return displayValue(this.value(sheetId, row, col), this.cell(sheetId, row, col), this.locale);
  }

  // ---------------------------------------------------------------------------
  // Formula text
  // ---------------------------------------------------------------------------

  /** What the formula bar shows: "=SUM(A1:A3)" or the literal value. */
  editText(sheetId: string, row: number, col: number): string {
    const cell = this.cell(sheetId, row, col);
    if (cell?.f !== undefined) return `=${this.formulaToA1(sheetId, cell.f)}`;
    return editableValue(cell, this.locale);
  }

  formulaToA1(sheetId: string, formula: string): string {
    return toDisplay(formula, {
      sheetId,
      sheetName: (id) => this.sheet(id)?.name ?? null,
      rowIndex: (sid, rowId) => this.sheet(sid)?.rowIndex.get(rowId) ?? -1,
      colIndex: (sid, colId) => this.sheet(sid)?.colIndex.get(colId) ?? -1,
    });
  }

  /** A1 formula (no "=") → internal form. Grows sheets if a reference is out of range. */
  formulaFromA1(sheetId: string, formula: string): string {
    return toInternal(formula, {
      sheetId,
      sheetIdByName: (name) => this.sheetIdByName(name),
      rowId: (sid, index) => this.idAt(sid, "row", index),
      colId: (sid, index) => this.idAt(sid, "col", index),
    });
  }

  private idAt(sheetId: string, axis: "row" | "col", index: number): string | null {
    let sheet = this.sheet(sheetId);
    if (!sheet) return null;
    const list = axis === "row" ? sheet.rows : sheet.cols;
    if (index >= list.length) {
      ensureSize(sheet.map, axis === "row" ? index + 1 : 0, axis === "col" ? index + 1 : 0);
      this.invalidate();
      sheet = this.sheet(sheetId)!;
    }
    return (axis === "row" ? sheet.rows : sheet.cols)[index] ?? null;
  }
}
