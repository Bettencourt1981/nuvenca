"use client";

import * as Y from "yjs";
import { dateToSerial } from "numfmt";
import type ExcelJSType from "exceljs";
import { Workbook } from "./engine";
import { columnIndex } from "./address";
import { parseCsv } from "./csv";
import { parseInput, type ParsedInput } from "./format";
import { newId } from "./ids";
import {
  DEFAULT_COLS,
  DEFAULT_ROWS,
  MAX_COLS,
  MAX_ROWS,
  buildSheet,
  cellKey,
  colWidths,
  rowHeights,
  sheetCells,
  sheetCharts,
  sheetMerges,
  sheetOrder,
  sheetRows,
  sheetCols,
  sheetsMap,
  type BorderSide,
  type Cell,
  type CellStyle,
} from "./model";
import { argbToHex, pointsToPx, stripFutureFunctionPrefixes, widthToPx } from "./xlsx-common";
import { readXlsxCharts, withoutDrawings, type XlsxChartIn } from "./xlsx-charts";

/** Imports larger than this many cells are cut short to keep the editor responsive. */
export const MAX_IMPORT_CELLS = 250_000;

function addSheetTo(doc: Y.Doc, name: string, rows: number, cols: number) {
  const id = newId(8);
  const sheet = buildSheet(name, rows, cols);
  sheetsMap(doc).set(id, sheet);
  sheetOrder(doc).push([id]);
  return { id, sheet };
}

/** CSV → a one-sheet workbook. */
export function csvToDoc(text: string, sheetName: string, locale: string): Y.Doc {
  const rows = parseCsv(text).slice(0, MAX_ROWS);
  const width = Math.min(Math.max(...rows.map((r) => r.length), 1), MAX_COLS);
  const doc = new Y.Doc();
  doc.transact(() => {
    const { sheet } = addSheetTo(doc, sheetName, Math.max(rows.length, DEFAULT_ROWS), Math.max(width, DEFAULT_COLS));
    const rowIds = sheetRows(sheet).toArray();
    const colIds = sheetCols(sheet).toArray();
    const cells = sheetCells(sheet);
    let count = 0;
    rows.forEach((values, r) =>
      values.slice(0, width).forEach((text, c) => {
        if (text === "" || count++ > MAX_IMPORT_CELLS) return;
        // CSV formulas are imported as text, never evaluated.
        const parsed: ParsedInput = text.startsWith("=") ? { kind: "value", value: text } : parseInput(text, locale);
        if (parsed.kind !== "value") return;
        const cell: Cell = { v: parsed.value };
        if (parsed.format) cell.s = { nf: parsed.format };
        cells.set(cellKey(rowIds[r], colIds[c]), cell);
      }),
    );
  });
  return doc;
}

function border(side: Partial<ExcelJSType.Border> | undefined): BorderSide | undefined {
  if (!side?.style) return undefined;
  const style = side.style === "medium" ? "medium" : side.style === "thick" || side.style === "double" ? "thick" : side.style.includes("dash") || side.style.includes("dot") ? "dashed" : "thin";
  return { style, color: argbToHex(side.color?.argb) ?? "#000000" };
}

function styleOf(cell: ExcelJSType.Cell): CellStyle | undefined {
  const s: CellStyle = {};
  const font = cell.font;
  if (font?.bold) s.b = true;
  if (font?.italic) s.i = true;
  if (font?.underline) s.u = true;
  if (font?.strike) s.st = true;
  const fc = argbToHex(font?.color?.argb);
  if (fc && fc !== "#000000") s.fc = fc;
  if (font?.size && font.size !== 10 && font.size !== 11) s.fs = font.size;
  if (font?.name && !/^(calibri|arial)$/i.test(font.name)) s.ff = font.name;
  const fill = cell.fill as ExcelJSType.FillPattern | undefined;
  if (fill?.type === "pattern" && fill.pattern === "solid") {
    const bg = argbToHex(fill.fgColor?.argb);
    if (bg && bg !== "#ffffff") s.bg = bg;
  }
  const a = cell.alignment;
  if (a?.horizontal === "left" || a?.horizontal === "center" || a?.horizontal === "right") s.ha = a.horizontal;
  if (a?.vertical === "top") s.va = "top";
  if (a?.vertical === "middle") s.va = "middle";
  if (a?.wrapText) s.wrap = true;
  if (cell.numFmt && cell.numFmt !== "General") s.nf = cell.numFmt;
  const b = cell.border;
  if (b) {
    const bt = border(b.top);
    const br = border(b.right);
    const bb = border(b.bottom);
    const bl = border(b.left);
    if (bt) s.bt = bt;
    if (br) s.br = br;
    if (bb) s.bb = bb;
    if (bl) s.bl = bl;
  }
  return Object.keys(s).length ? s : undefined;
}

function literal(value: ExcelJSType.CellValue): string | number | boolean | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") return value;
  if (value instanceof Date) return dateToSerial(value) as number;
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("error" in value) return String(value.error);
    if ("result" in value) return literal(value.result as ExcelJSType.CellValue);
  }
  return undefined;
}

/** .xlsx → workbook document (values, formulas, styles, sizes, merges, freezes). */
export async function xlsxToDoc(data: ArrayBuffer, locale: string): Promise<Y.Doc> {
  const ExcelJS = (await import("exceljs")).default;
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await withoutDrawings(data));

  // Charts are read from the zip directly (ExcelJS ignores them). Sizes use
  // Excel's defaults (64 px columns, 20 px rows) where the file sets none.
  let charts = new Map<string, XlsxChartIn[]>();
  try {
    charts = await readXlsxCharts(data, {
      colWidth: (sheet, col) => widthToPx(book.getWorksheet(sheet)?.getColumn(col + 1).width ?? 8.43),
      rowHeight: (sheet, row) => pointsToPx(book.getWorksheet(sheet)?.getRow(row + 1).height ?? 15),
    });
  } catch {
    // A damaged chart part shouldn't block the data.
  }

  const doc = new Y.Doc();
  const formulas: { sheetId: string; key: string; formula: string; style?: CellStyle }[] = [];
  let budget = MAX_IMPORT_CELLS;

  doc.transact(() => {
    for (const ws of book.worksheets) {
      if (ws.state && ws.state !== "visible") continue;
      const rowCount = Math.min(Math.max(ws.rowCount, DEFAULT_ROWS), MAX_ROWS);
      const colCount = Math.min(Math.max(ws.columnCount, DEFAULT_COLS), MAX_COLS);
      const { id, sheet } = addSheetTo(doc, ws.name, rowCount, colCount);
      const rowIds = sheetRows(sheet).toArray();
      const colIds = sheetCols(sheet).toArray();
      const cells = sheetCells(sheet);

      ws.columns?.forEach((column, c) => {
        if (c < colCount && column.width) colWidths(sheet).set(colIds[c], widthToPx(column.width));
      });
      const view = ws.views?.[0] as { state?: string; xSplit?: number; ySplit?: number } | undefined;
      if (view?.state === "frozen") {
        sheet.set("frozenRows", Math.min(view.ySplit ?? 0, 20));
        sheet.set("frozenCols", Math.min(view.xSplit ?? 0, 10));
      }

      ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        const r = rowNumber - 1;
        if (r >= rowCount) return;
        if (row.height) rowHeights(sheet).set(rowIds[r], pointsToPx(row.height));
        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          const c = colNumber - 1;
          if (c >= colCount || budget-- <= 0) return;
          const key = cellKey(rowIds[r], colIds[c]);
          const style = styleOf(cell);
          const formula = cell.type === ExcelJS.ValueType.Formula ? cell.formula : undefined;
          if (formula) {
            formulas.push({ sheetId: id, key, formula: stripFutureFunctionPrefixes(formula), style });
            return;
          }
          const value = literal(cell.value);
          if (value === undefined && !style) return;
          cells.set(key, { ...(value === undefined ? {} : { v: value }), ...(style ? { s: style } : {}) });
        });
      });

      const merges = (ws.model as { merges?: string[] }).merges ?? [];
      for (const ref of merges) {
        const match = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(ref);
        if (!match) continue;
        const r1 = Number(match[2]) - 1;
        const r2 = Number(match[4]) - 1;
        const c1 = columnIndex(match[1]);
        const c2 = columnIndex(match[3]);
        if (r2 >= rowCount || c2 >= colCount) continue;
        sheetMerges(sheet).set(newId(), { r1: rowIds[r1], c1: colIds[c1], r2: rowIds[r2], c2: colIds[c2] });
      }

      for (const chart of charts.get(ws.name) ?? []) {
        const { range, anchor } = chart;
        if (range.r2 >= rowCount || range.c2 >= colCount || anchor.row >= rowCount || anchor.col >= colCount) continue;
        sheetCharts(sheet).set(newId(), {
          type: chart.type,
          ...(chart.title ? { title: chart.title } : {}),
          range: { r1: rowIds[range.r1], c1: colIds[range.c1], r2: rowIds[range.r2], c2: colIds[range.c2] },
          anchor: { rowId: rowIds[anchor.row], colId: colIds[anchor.col], dx: Math.max(0, anchor.dx), dy: Math.max(0, anchor.dy) },
          width: chart.width,
          height: chart.height,
          headers: chart.headers,
        });
      }
    }

    if (sheetOrder(doc).length === 0) addSheetTo(doc, "Sheet1", DEFAULT_ROWS, DEFAULT_COLS);

    // Formulas last: references to other sheets need every sheet to exist.
    const wb = new Workbook(doc, locale);
    for (const { sheetId, key, formula, style } of formulas) {
      const internal = wb.formulaFromA1(sheetId, formula);
      sheetCells(sheetsMap(doc).get(sheetId)!).set(key, { f: internal, ...(style ? { s: style } : {}) });
    }
  });
  return doc;
}
