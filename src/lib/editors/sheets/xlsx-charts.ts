/**
 * Charts in .xlsx files (DrawingML). ExcelJS reads and writes cells but not
 * charts, so charts are added to (export) or read from (import) the zip here.
 * Works in the browser and in Node.
 */
import type JSZipType from "jszip";
import type { ChartType } from "./model";

const EMU_PER_PX = 9525;

const NS = {
  c: "http://schemas.openxmlformats.org/drawingml/2006/chart",
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  xdr: "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
  rel: "http://schemas.openxmlformats.org/package/2006/relationships",
};
const REL = {
  drawing: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing",
  chart: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart",
};
const CONTENT = {
  drawing: "application/vnd.openxmlformats-officedocument.drawing+xml",
  chart: "application/vnd.openxmlformats-officedocument.drawingml.chart+xml",
};

const COLORS = ["4285F4", "EA4335", "FBBC04", "34A853", "FF6D01", "46BDC6", "7BAAF7", "F07B72", "FCD04F", "71C287"];

type Range = { r1: number; c1: number; r2: number; c2: number };

/** A chart to write, with positions as 0-based indices and sizes in px. */
export type XlsxChartOut = {
  type: ChartType;
  title?: string;
  /** Data range; first row = series names (if headers), first column = categories. */
  range: Range;
  headers: boolean;
  anchor: { row: number; col: number; dx: number; dy: number };
  width: number;
  height: number;
  /** Cached values (shown by apps that don't recalculate). */
  categories: string[];
  series: { name: string; values: (number | null)[] }[];
};

/** A chart read from a file. */
export type XlsxChartIn = Omit<XlsxChartOut, "categories" | "series">;

/** Escape for XML text and double-quoted attributes (apostrophes stay, as Excel writes them). */
const xml = (value: string) => value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function columnLetters(index: number) {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}
function columnNumber(letters: string) {
  return letters.split("").reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
}
const quoteSheet = (name: string) => `'${name.replace(/'/g, "''")}'`;
const ref = (sheet: string, r1: number, c1: number, r2 = r1, c2 = c1) =>
  `${quoteSheet(sheet)}!$${columnLetters(c1)}$${r1 + 1}` + (r1 === r2 && c1 === c2 ? "" : `:$${columnLetters(c2)}$${r2 + 1}`);

/** "'My sheet'!$A$1:$B$4" → sheet name and indices. */
function parseRef(formula: string): { sheet: string; range: Range } | null {
  const match = /^(?:'((?:[^']|'')+)'|([^!]+))!\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/.exec(formula.trim());
  if (!match) return null;
  const sheet = match[1] !== undefined ? match[1].replace(/''/g, "'") : match[2];
  const c1 = columnNumber(match[3]);
  const r1 = Number(match[4]) - 1;
  const c2 = match[5] ? columnNumber(match[5]) : c1;
  const r2 = match[6] ? Number(match[6]) - 1 : r1;
  return { sheet, range: { r1: Math.min(r1, r2), c1: Math.min(c1, c2), r2: Math.max(r1, r2), c2: Math.max(c1, c2) } };
}

// ---------------------------------------------------------------------------
// Package helpers
// ---------------------------------------------------------------------------

/** Sheet name → worksheet part path ("xl/worksheets/sheet1.xml"). */
async function sheetParts(zip: JSZipType): Promise<Map<string, string>> {
  const workbook = (await zip.file("xl/workbook.xml")?.async("string")) ?? "";
  const rels = (await zip.file("xl/_rels/workbook.xml.rels")?.async("string")) ?? "";
  const targets = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[0])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(m[0])?.[1];
    if (id && target) targets.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  }
  const parts = new Map<string, string>();
  for (const m of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const name = /\bname="([^"]*)"/.exec(m[0])?.[1];
    const id = /\br:id="([^"]+)"/.exec(m[0])?.[1];
    const target = id ? targets.get(id) : undefined;
    if (name !== undefined && target) parts.set(unescapeXml(name), target);
  }
  return parts;
}

function unescapeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
}

const relsPath = (part: string) => part.replace(/([^/]+)$/, "_rels/$1.rels");
function resolveTarget(from: string, target: string) {
  if (target.startsWith("/")) return target.slice(1);
  const parts = from.split("/").slice(0, -1);
  for (const piece of target.split("/")) {
    if (piece === "..") parts.pop();
    else if (piece !== ".") parts.push(piece);
  }
  return parts.join("/");
}
async function readRels(zip: JSZipType, part: string) {
  const text = (await zip.file(relsPath(part))?.async("string")) ?? "";
  const rels = new Map<string, { type: string; target: string }>();
  for (const m of text.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[0])?.[1];
    const type = /\bType="([^"]+)"/.exec(m[0])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(m[0])?.[1];
    if (id && type && target) rels.set(id, { type, target: resolveTarget(part, unescapeXml(target)) });
  }
  return rels;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function seriesXml(chart: XlsxChartOut, sheet: string, index: number) {
  const { range, headers } = chart;
  const firstRow = headers ? range.r1 + 1 : range.r1;
  const labelCol = range.c2 > range.c1 ? range.c1 : null;
  const col = (labelCol === null ? range.c1 : range.c1 + 1) + index;
  const series = chart.series[index];
  const color = COLORS[index % COLORS.length];
  const count = range.r2 - firstRow + 1;

  const tx = headers
    ? `<c:tx><c:strRef><c:f>${xml(ref(sheet, range.r1, col))}</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${xml(series.name)}</c:v></c:pt></c:strCache></c:strRef></c:tx>`
    : `<c:tx><c:v>${xml(series.name)}</c:v></c:tx>`;
  const numbers = (values: (number | null)[]) =>
    `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${values.length}"/>${values
      .map((v, i) => (v === null ? "" : `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`))
      .join("")}</c:numCache>`;
  const values = `<c:numRef><c:f>${xml(ref(sheet, firstRow, col, range.r2, col))}</c:f>${numbers(series.values)}</c:numRef>`;
  const categories =
    labelCol === null
      ? ""
      : `<c:strRef><c:f>${xml(ref(sheet, firstRow, labelCol, range.r2, labelCol))}</c:f><c:strCache><c:ptCount val="${count}"/>${chart.categories
          .map((label, i) => `<c:pt idx="${i}"><c:v>${xml(label)}</c:v></c:pt>`)
          .join("")}</c:strCache></c:strRef>`;
  const fill = `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>`;
  const head = `<c:idx val="${index}"/><c:order val="${index}"/>${tx}`;

  switch (chart.type) {
    case "line":
      return `<c:ser>${head}<c:spPr><a:ln w="28575" cap="rnd">${fill}<a:round/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr>${fill}</c:spPr></c:marker>${categories ? `<c:cat>${categories}</c:cat>` : ""}<c:val>${values}</c:val><c:smooth val="0"/></c:ser>`;
    case "area":
      // Semi-transparent, so overlapping series stay visible (as in the editor).
      return `<c:ser>${head}<c:spPr><a:solidFill><a:srgbClr val="${color}"><a:alpha val="55000"/></a:srgbClr></a:solidFill><a:ln w="19050">${fill}</a:ln></c:spPr>${categories ? `<c:cat>${categories}</c:cat>` : ""}<c:val>${values}</c:val></c:ser>`;
    case "pie":
      return `<c:ser>${head}${chart.categories
        .map((_, i) => `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${COLORS[i % COLORS.length]}"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:dPt>`)
        .join("")}${categories ? `<c:cat>${categories}</c:cat>` : ""}<c:val>${values}</c:val></c:ser>`;
    case "scatter": {
      const xs =
        labelCol === null
          ? ""
          : `<c:xVal><c:numRef><c:f>${xml(ref(sheet, firstRow, labelCol, range.r2, labelCol))}</c:f>${numbers(chart.categories.map((v) => (v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null)))}</c:numRef></c:xVal>`;
      return `<c:ser>${head}<c:spPr><a:ln w="19050"><a:noFill/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="7"/><c:spPr>${fill}</c:spPr></c:marker>${xs}<c:yVal>${values}</c:yVal><c:smooth val="0"/></c:ser>`;
    }
    default:
      return `<c:ser>${head}<c:spPr>${fill}</c:spPr><c:invertIfNegative val="0"/>${categories ? `<c:cat>${categories}</c:cat>` : ""}<c:val>${values}</c:val></c:ser>`;
  }
}

function axesXml(chart: XlsxChartOut) {
  const horizontal = chart.type === "bar";
  const valAx = (id: number, cross: number, pos: string, grid: boolean) =>
    `<c:valAx><c:axId val="${id}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${pos}"/>${grid ? "<c:majorGridlines/>" : ""}<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="${cross}"/><c:crosses val="autoZero"/><c:crossBetween val="${chart.type === "scatter" ? "midCat" : "between"}"/></c:valAx>`;
  if (chart.type === "scatter") return valAx(500001, 500002, "b", false) + valAx(500002, 500001, "l", true);
  const catAx = `<c:catAx><c:axId val="500001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${horizontal ? "l" : "b"}"/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="500002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`;
  return catAx + valAx(500002, 500001, horizontal ? "b" : "l", true);
}

function chartXml(chart: XlsxChartOut, sheet: string) {
  const all = chart.series.map((_, i) => seriesXml(chart, sheet, i));
  const series = chart.type === "pie" ? all.slice(0, 1).join("") : all.join("");
  const axIds = `<c:axId val="500001"/><c:axId val="500002"/>`;
  let plot: string;
  switch (chart.type) {
    case "line":
      plot = `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${series}<c:marker val="1"/>${axIds}</c:lineChart>`;
      break;
    case "area":
      plot = `<c:areaChart><c:grouping val="standard"/><c:varyColors val="0"/>${series}${axIds}</c:areaChart>`;
      break;
    case "pie":
      plot = `<c:pieChart><c:varyColors val="1"/>${series}<c:firstSliceAng val="0"/></c:pieChart>`;
      break;
    case "scatter":
      plot = `<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>${series}${axIds}</c:scatterChart>`;
      break;
    default:
      plot = `<c:barChart><c:barDir val="${chart.type === "bar" ? "bar" : "col"}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${series}<c:gapWidth val="150"/>${axIds}</c:barChart>`;
  }
  const title = chart.title
    ? `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1400" b="0"/></a:pPr><a:r><a:rPr lang="en-US" sz="1400" b="0"/><a:t>${xml(chart.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>`
    : `<c:autoTitleDeleted val="1"/>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="${NS.c}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><c:roundedCorners val="0"/><c:chart>${title}<c:plotArea><c:layout/>${plot}${chart.type === "pie" ? "" : axesXml(chart)}</c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
}

function anchorXml(chart: XlsxChartOut, index: number, relId: string) {
  return `<xdr:oneCellAnchor><xdr:from><xdr:col>${chart.anchor.col}</xdr:col><xdr:colOff>${Math.round(chart.anchor.dx * EMU_PER_PX)}</xdr:colOff><xdr:row>${chart.anchor.row}</xdr:row><xdr:rowOff>${Math.round(chart.anchor.dy * EMU_PER_PX)}</xdr:rowOff></xdr:from><xdr:ext cx="${Math.round(chart.width * EMU_PER_PX)}" cy="${Math.round(chart.height * EMU_PER_PX)}"/><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${index + 2}" name="${xml(chart.title || `Chart ${index + 1}`)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="${NS.c}"><c:chart xmlns:c="${NS.c}" xmlns:r="${NS.r}" r:id="${relId}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:oneCellAnchor>`;
}

/** Insert `<drawing r:id>` where the worksheet schema expects it. */
function addDrawingElement(sheetXml: string, relId: string) {
  const element = `<drawing r:id="${relId}"/>`;
  let xmlText = sheetXml;
  if (!/xmlns:r=/.test(xmlText.slice(0, xmlText.indexOf(">", xmlText.indexOf("<worksheet")))))
    xmlText = xmlText.replace(/<worksheet\b/, `<worksheet xmlns:r="${NS.r}"`);
  const later = /<(legacyDrawing|legacyDrawingHF|drawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b/.exec(xmlText);
  const at = later ? later.index : xmlText.lastIndexOf("</worksheet>");
  return xmlText.slice(0, at) + element + xmlText.slice(at);
}

/** Add charts to an .xlsx produced by ExcelJS. `charts`: sheet name → charts. */
export async function addChartsToXlsx(data: Uint8Array, charts: Map<string, XlsxChartOut[]>): Promise<Uint8Array> {
  if (![...charts.values()].some((list) => list.length)) return data;
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(data);
  const parts = await sheetParts(zip);
  let types = (await zip.file("[Content_Types].xml")?.async("string")) ?? "";
  const existing = (prefix: string) => Object.keys(zip.files).filter((p) => p.startsWith(prefix)).length;
  let drawingNo = existing("xl/drawings/drawing");
  let chartNo = existing("xl/charts/chart");

  for (const [sheetName, list] of charts) {
    const part = parts.get(sheetName);
    if (!part || list.length === 0) continue;
    const drawingPath = `xl/drawings/drawing${++drawingNo}.xml`;
    const drawingRels: string[] = [];
    const anchors: string[] = [];
    list.forEach((chart, i) => {
      const chartPath = `xl/charts/chart${++chartNo}.xml`;
      zip.file(chartPath, chartXml(chart, sheetName));
      types = types.replace("</Types>", `<Override PartName="/${chartPath}" ContentType="${CONTENT.chart}"/></Types>`);
      drawingRels.push(`<Relationship Id="rId${i + 1}" Type="${REL.chart}" Target="../charts/chart${chartNo}.xml"/>`);
      anchors.push(anchorXml(chart, i, `rId${i + 1}`));
    });
    zip.file(
      drawingPath,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="${NS.xdr}" xmlns:a="${NS.a}">${anchors.join("")}</xdr:wsDr>`,
    );
    zip.file(relsPath(drawingPath), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${NS.rel}">${drawingRels.join("")}</Relationships>`);
    types = types.replace("</Types>", `<Override PartName="/${drawingPath}" ContentType="${CONTENT.drawing}"/></Types>`);

    // Link the drawing from the worksheet.
    const sheetRelsPath = relsPath(part);
    let sheetRels = (await zip.file(sheetRelsPath)?.async("string")) ?? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${NS.rel}"></Relationships>`;
    let relId = "rIdNuvencaDrawing";
    for (let n = 1; sheetRels.includes(`Id="${relId}"`); n++) relId = `rIdNuvencaDrawing${n}`;
    sheetRels = sheetRels.replace("</Relationships>", `<Relationship Id="${relId}" Type="${REL.drawing}" Target="../drawings/drawing${drawingNo}.xml"/></Relationships>`);
    zip.file(sheetRelsPath, sheetRels);
    zip.file(part, addDrawingElement(await zip.file(part)!.async("string"), relId));
  }
  zip.file("[Content_Types].xml", types);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

const firstMatch = (text: string, pattern: RegExp) => pattern.exec(text)?.[1];

/** Drop namespace prefixes from element names (c:ser → ser): writers choose prefixes freely. */
const unprefixed = (text: string) => text.replace(/<(\/?)[\w.-]+:(?=[\w.-])/g, "<$1");
/** A relationship id attribute, whatever its prefix (`r:id`). */
const REL_ID = /\s[\w.-]+:id="([^"]+)"/;

function chartTypeOf(chartXmlText: string): ChartType | null {
  const plot = /<(barChart|bar3DChart|lineChart|line3DChart|areaChart|area3DChart|pieChart|pie3DChart|doughnutChart|scatterChart)\b([\s\S]*?)<\/\1>/.exec(chartXmlText);
  if (!plot) return null;
  switch (plot[1]) {
    case "barChart":
    case "bar3DChart":
      return /<barDir val="bar"/.test(plot[2]) ? "bar" : "column";
    case "lineChart":
    case "line3DChart":
      return "line";
    case "areaChart":
    case "area3DChart":
      return "area";
    case "scatterChart":
      return "scatter";
    default:
      return "pie";
  }
}

/** Charts per sheet name, from an .xlsx file. Only column-oriented series on the same sheet are kept. */
export async function readXlsxCharts(
  data: ArrayBuffer | Uint8Array,
  size: { colWidth: (sheet: string, col: number) => number; rowHeight: (sheet: string, row: number) => number },
): Promise<Map<string, XlsxChartIn[]>> {
  const result = new Map<string, XlsxChartIn[]>();
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(data);
  const parts = await sheetParts(zip);

  for (const [sheetName, part] of parts) {
    const sheetXml = unprefixed((await zip.file(part)?.async("string")) ?? "");
    const drawingId = firstMatch(/<drawing\b[^>]*>/.exec(sheetXml)?.[0] ?? "", REL_ID);
    if (!drawingId) continue;
    const drawing = (await readRels(zip, part)).get(drawingId);
    if (!drawing || drawing.type !== REL.drawing) continue;
    const drawingXml = unprefixed((await zip.file(drawing.target)?.async("string")) ?? "");
    const drawingRels = await readRels(zip, drawing.target);

    for (const anchor of drawingXml.matchAll(/<(twoCellAnchor|oneCellAnchor|absoluteAnchor)\b[\s\S]*?<\/\1>/g)) {
      const text = anchor[0];
      const chartId = firstMatch(/<chart\b[^>]*>/.exec(text)?.[0] ?? "", REL_ID);
      const chartPart = chartId ? drawingRels.get(chartId) : undefined;
      if (!chartPart || chartPart.type !== REL.chart) continue;
      const chartText = unprefixed((await zip.file(chartPart.target)?.async("string")) ?? "");
      const type = chartTypeOf(chartText);
      if (!type) continue;

      // Position and size.
      const num = (pattern: RegExp, source: string) => Number(firstMatch(source, pattern) ?? 0);
      const from = firstMatch(text, /<from>([\s\S]*?)<\/from>/) ?? "";
      const anchorPos = {
        col: num(/<col>(\d+)</, from),
        row: num(/<row>(\d+)</, from),
        dx: Math.round(num(/<colOff>(-?\d+)</, from) / EMU_PER_PX),
        dy: Math.round(num(/<rowOff>(-?\d+)</, from) / EMU_PER_PX),
      };
      let width = Math.round(num(/<ext\b[^>]*cx="(\d+)"/, text) / EMU_PER_PX);
      let height = Math.round(num(/<ext\b[^>]*cy="(\d+)"/, text) / EMU_PER_PX);
      if (anchor[1] === "twoCellAnchor") {
        const to = firstMatch(text, /<to>([\s\S]*?)<\/to>/) ?? "";
        const toCol = num(/<col>(\d+)</, to);
        const toRow = num(/<row>(\d+)</, to);
        width = -anchorPos.dx + Math.round(num(/<colOff>(-?\d+)</, to) / EMU_PER_PX);
        for (let c = anchorPos.col; c < toCol; c++) width += size.colWidth(sheetName, c);
        height = -anchorPos.dy + Math.round(num(/<rowOff>(-?\d+)</, to) / EMU_PER_PX);
        for (let r = anchorPos.row; r < toRow; r++) height += size.rowHeight(sheetName, r);
      }

      // Data: categories + values (+ names) must sit in columns of one sheet.
      const refs: { sheet: string; range: Range }[] = [];
      let named = false;
      let ok = true;
      for (const ser of chartText.matchAll(/<ser>([\s\S]*?)<\/ser>/g)) {
        const body = ser[1];
        const tx = firstMatch(body, /<tx>\s*<strRef>\s*<f>([^<]+)<\/f>/);
        const cat = firstMatch(body, /<(?:cat|xVal)>\s*<(?:strRef|numRef)>\s*<f>([^<]+)<\/f>/);
        const val = firstMatch(body, /<(?:val|yVal)>\s*<numRef>\s*<f>([^<]+)<\/f>/);
        const parsedVal = val ? parseRef(unescapeXml(val)) : null;
        if (!parsedVal || parsedVal.range.c1 !== parsedVal.range.c2) {
          ok = false;
          break;
        }
        refs.push(parsedVal);
        if (cat) {
          const parsed = parseRef(unescapeXml(cat));
          if (parsed) refs.push(parsed);
        }
        if (tx) {
          const parsed = parseRef(unescapeXml(tx));
          if (parsed) {
            refs.push(parsed);
            named = true;
          }
        }
      }
      // Nuvenca charts plot data from their own sheet.
      if (!ok || refs.length === 0 || refs.some((r) => r.sheet !== sheetName)) continue;
      const range = refs.reduce<Range>(
        (box, r) => ({
          r1: Math.min(box.r1, r.range.r1),
          c1: Math.min(box.c1, r.range.c1),
          r2: Math.max(box.r2, r.range.r2),
          c2: Math.max(box.c2, r.range.c2),
        }),
        { ...refs[0].range },
      );
      const titleRuns = firstMatch(chartText, /<title>([\s\S]*?)<\/title>/);
      const title = titleRuns
        ? Array.from(titleRuns.matchAll(/<t>([^<]*)<\/t>/g), (m) => unescapeXml(m[1])).join("") || undefined
        : undefined;
      const list = result.get(sheetName) ?? [];
      list.push({ type, title, range, headers: named, anchor: anchorPos, width: Math.max(width, 120), height: Math.max(height, 80) });
      result.set(sheetName, list);
    }
  }
  return result;
}

/**
 * The same file without drawing references in its worksheets. Charts are read
 * by `readXlsxCharts`; ExcelJS doesn't need drawings, and some files (e.g. with
 * absolute part paths, as written by openpyxl) make it fail on them.
 */
export async function withoutDrawings(data: ArrayBuffer): Promise<ArrayBuffer> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(data);
  let changed = false;
  for (const path of Object.keys(zip.files)) {
    // Drawing and chart parts (comment notes live in .vml drawings: kept).
    if (/^xl\/drawings\/(_rels\/)?[^/]+\.xml(\.rels)?$/.test(path) || /^xl\/charts\//.test(path)) {
      zip.remove(path);
      changed = true;
      continue;
    }
    if (!/^xl\/worksheets\/[^/]+\.xml$/.test(path)) continue;
    const text = await zip.files[path].async("string");
    if (!/<drawing\b/.test(text)) continue;
    zip.file(path, text.replace(/<drawing\b[^>]*\/>/g, ""));
    changed = true;
  }
  if (!changed) return data;
  return zip.generateAsync({ type: "arraybuffer" });
}
