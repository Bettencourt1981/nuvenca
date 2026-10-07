import "server-only";
import type * as Y from "yjs";
import ExcelJS from "exceljs";
import { Workbook } from "./engine";
import { isError } from "./formula/values";
import { rangeName } from "./address";
import type { BorderSide, CellStyle } from "./model";
import { addFutureFunctionPrefixes, hexToArgb, pxToPoints, pxToWidth } from "./xlsx-common";

function border(side: BorderSide | undefined): Partial<ExcelJS.Border> | undefined {
  if (!side) return undefined;
  return {
    style: side.style === "dashed" ? "dashed" : side.style,
    color: { argb: hexToArgb(side.color) ?? "FF000000" },
  };
}

function applyStyle(cell: ExcelJS.Cell, s: CellStyle) {
  const color = hexToArgb(s.fc);
  if (s.b || s.i || s.u || s.st || color || s.fs || s.ff) {
    cell.font = {
      name: s.ff ?? "Arial",
      size: s.fs ?? 10,
      bold: s.b,
      italic: s.i,
      underline: s.u,
      strike: s.st,
      ...(color ? { color: { argb: color } } : {}),
    };
  }
  const fill = hexToArgb(s.bg);
  if (fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
  if (s.ha || s.va || s.wrap) {
    cell.alignment = { horizontal: s.ha, vertical: s.va ?? "bottom", wrapText: s.wrap };
  }
  if (s.nf) cell.numFmt = s.nf;
  if (s.bt || s.br || s.bb || s.bl) {
    cell.border = { top: border(s.bt), right: border(s.br), bottom: border(s.bb), left: border(s.bl) };
  }
}

/** Workbook document → .xlsx (values, formulas with cached results, styles, sizes, merges, freezes, filters). */
export async function workbookToXlsx(doc: Y.Doc): Promise<Uint8Array> {
  const wb = new Workbook(doc, "en");
  const book = new ExcelJS.Workbook();
  book.creator = "Nuvenca";
  const used = new Set<string>();

  for (const sheet of wb.sheets()) {
    // Excel sheet names: max 31 chars, no []:*?/\ and unique.
    let name = sheet.name.replace(/[[\]:*?/\\]/g, "_").slice(0, 31) || "Sheet";
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${name.slice(0, 28)} ${n}`;
    used.add(name.toLowerCase());

    const ws = book.addWorksheet(name, {
      views: sheet.frozenRows || sheet.frozenCols ? [{ state: "frozen", xSplit: sheet.frozenCols, ySplit: sheet.frozenRows }] : [],
    });
    const lastCol = Math.max(sheet.used.cols, 1);
    for (let c = 0; c < Math.min(sheet.cols.length, Math.max(lastCol, 26)); c++) {
      ws.getColumn(c + 1).width = pxToWidth(sheet.widths[c]);
    }

    sheet.cells.forEach((cell, key) => {
      const split = key.indexOf(":");
      const r = sheet.rowIndex.get(key.slice(0, split));
      const c = sheet.colIndex.get(key.slice(split + 1));
      if (r === undefined || c === undefined) return;
      const target = ws.getCell(r + 1, c + 1);
      if (cell.f !== undefined) {
        const result = wb.value(sheet.id, r, c);
        target.value = {
          formula: addFutureFunctionPrefixes(wb.formulaToA1(sheet.id, cell.f)),
          result: isError(result) ? { error: result.code as ExcelJS.CellErrorValue["error"] } : (result ?? undefined),
        } as ExcelJS.CellFormulaValue;
      } else if (cell.v !== undefined) {
        target.value = cell.v;
      }
      if (cell.s) applyStyle(target, cell.s);
    });

    sheet.heights.forEach((height, r) => {
      if (height !== 21 && r < Math.max(sheet.used.rows, 1)) ws.getRow(r + 1).height = pxToPoints(height);
    });
    for (const m of sheet.merges) ws.mergeCells(m.r1 + 1, m.c1 + 1, m.r2 + 1, m.c2 + 1);
    if (sheet.filter) {
      const r1 = sheet.rowIndex.get(sheet.filter.range.r1);
      const r2 = sheet.rowIndex.get(sheet.filter.range.r2);
      const c1 = sheet.colIndex.get(sheet.filter.range.c1);
      const c2 = sheet.colIndex.get(sheet.filter.range.c2);
      if (r1 !== undefined && r2 !== undefined && c1 !== undefined && c2 !== undefined) {
        ws.autoFilter = rangeName({ r1, c1, r2, c2 });
      }
    }
  }
  const buffer = await book.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
