import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import { SaxesParser } from "saxes";
import { readFileSync } from "node:fs";
import { workbookToXlsx } from "../export-xlsx";
import { xlsxToDoc } from "../import-xlsx";
import { cellKey, initWorkbook, sheetCells, sheetCharts, sheetCols, sheetRows, sheetsMap, type Chart, type ChartType } from "../model";

function workbookWithChart(type: ChartType, title?: string) {
  const doc = new Y.Doc();
  const sheetId = initWorkbook(doc, "Vendas 2027");
  const sheet = sheetsMap(doc).get(sheetId)!;
  const rows = sheetRows(sheet).toArray();
  const cols = sheetCols(sheet).toArray();
  const data = [
    ["Mês", "Receita", "Custos"],
    ["Jan", 1000, 600],
    ["Fev", 1200, 650],
    ["Mar", 900, 700],
  ];
  data.forEach((row, r) => row.forEach((v, c) => sheetCells(sheet).set(cellKey(rows[r], cols[c]), { v })));
  const chart: Chart = {
    type,
    title,
    range: { r1: rows[0], c1: cols[0], r2: rows[3], c2: cols[2] },
    anchor: { rowId: rows[1], colId: cols[4], dx: 10, dy: 5 },
    width: 480,
    height: 300,
    headers: true,
  };
  sheetCharts(sheet).set("chart1", chart);
  return doc;
}

function wellFormed(xml: string) {
  const parser = new SaxesParser({ xmlns: true });
  parser.write(xml).close();
}

describe("charts in Excel files", () => {
  it("exports charts as DrawingML parts linked from the sheet", async () => {
    const file = await workbookToXlsx(workbookWithChart("column", "Receita & custos"));
    const zip = await JSZip.loadAsync(file);
    const chart = await zip.file("xl/charts/chart1.xml")!.async("string");
    const drawing = await zip.file("xl/drawings/drawing1.xml")!.async("string");
    const sheet = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    const sheetRels = await zip.file("xl/worksheets/_rels/sheet1.xml.rels")!.async("string");
    const types = await zip.file("[Content_Types].xml")!.async("string");
    for (const xml of [chart, drawing, sheet, sheetRels, types]) wellFormed(xml);

    expect(chart).toContain('<c:barDir val="col"/>');
    expect(chart).toContain("<c:f>'Vendas 2027'!$B$2:$B$4</c:f>");
    expect(chart).toContain("<c:f>'Vendas 2027'!$A$2:$A$4</c:f>");
    expect(chart).toContain("<c:f>'Vendas 2027'!$C$1</c:f>");
    expect(chart).toContain("<c:v>1200</c:v>");
    expect(chart).toContain("<a:t>Receita &amp; custos</a:t>");
    expect(drawing).toContain("<xdr:col>4</xdr:col>");
    expect(sheet).toMatch(/<drawing r:id="rIdNuvencaDrawing"\/><\/worksheet>|<drawing r:id="rIdNuvencaDrawing"\/>/);
    expect(sheetRels).toContain("../drawings/drawing1.xml");
    expect(types).toContain('PartName="/xl/charts/chart1.xml"');

    // Cells are untouched.
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(file as unknown as ArrayBuffer);
    expect(book.getWorksheet("Vendas 2027")!.getCell("B3").value).toBe(1200);
  });

  it.each(["column", "bar", "line", "area", "pie", "scatter"] as ChartType[])("round-trips %s charts", async (type) => {
    const file = await workbookToXlsx(workbookWithChart(type, "Resumo"));
    const zip = await JSZip.loadAsync(file);
    wellFormed(await zip.file("xl/charts/chart1.xml")!.async("string"));

    const doc = await xlsxToDoc(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer, "en");
    const sheet = sheetsMap(doc).get(Array.from(sheetsMap(doc).keys())[0])!;
    const charts = Array.from(sheetCharts(sheet).values());
    expect(charts).toHaveLength(1);
    const [chart] = charts;
    const rows = sheetRows(sheet).toArray();
    const cols = sheetCols(sheet).toArray();
    expect(chart.type).toBe(type);
    expect(chart.title).toBe("Resumo");
    expect(chart.headers).toBe(true);
    // Pie charts plot one series, so their range narrows to it.
    const lastCol = type === "pie" ? 1 : 2;
    expect(chart.range).toEqual({ r1: rows[0], c1: cols[0], r2: rows[3], c2: cols[lastCol] });
    expect(chart.anchor).toEqual({ rowId: rows[1], colId: cols[4], dx: 10, dy: 5 });
    expect([chart.width, chart.height]).toEqual([480, 300]);
  });

  // Files saved by other programs: LibreOffice (prefixed XML, two-cell anchors) and
  // openpyxl (unprefixed XML, absolute part paths, which ExcelJS can't load).
  it.each([
    ["libreoffice-charts.xlsx", ["column", "bar", "line", "area", "pie", "scatter"]],
    ["openpyxl-charts.xlsx", ["column", "line"]],
  ])("reads charts written by other apps (%s)", async (name, types) => {
    const file = readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
    const doc = await xlsxToDoc(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer, "en");
    const sheet = sheetsMap(doc).get(Array.from(sheetsMap(doc).keys())[0])!;
    const charts = Array.from(sheetCharts(sheet).values());
    expect(charts.map((c) => c.type)).toEqual(types);
    expect(charts.every((c) => c.width > 100 && c.height > 100)).toBe(true);
  });
});
