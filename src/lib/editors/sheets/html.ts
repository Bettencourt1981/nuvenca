import type { Workbook } from "./engine";
import { isError } from "./formula/values";

function escape(text: string) {
  return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** The used range of a sheet as an HTML table (printing, clipboard). */
export function sheetToHtml(wb: Workbook, sheetId: string, range?: { r1: number; c1: number; r2: number; c2: number }): string {
  const sheet = wb.sheet(sheetId);
  if (!sheet) return "<table></table>";
  const r1 = range?.r1 ?? 0;
  const c1 = range?.c1 ?? 0;
  const r2 = range?.r2 ?? Math.max(sheet.used.rows - 1, 0);
  const c2 = range?.c2 ?? Math.max(sheet.used.cols - 1, 0);
  const anchors = new Map(sheet.merges.map((m) => [`${m.r1}:${m.c1}`, m]));
  let html = '<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:10pt">';
  for (let r = r1; r <= r2; r++) {
    html += `<tr style="height:${sheet.heights[r]}px">`;
    for (let c = c1; c <= c2; c++) {
      if (sheet.covered.has(`${r}:${c}`)) continue;
      const merge = anchors.get(`${r}:${c}`);
      const cell = wb.cell(sheetId, r, c);
      const value = wb.value(sheetId, r, c);
      const s = cell?.s ?? {};
      const align = s.ha ?? (typeof value === "number" ? "right" : typeof value === "boolean" || isError(value) ? "center" : "left");
      const css = [
        "border:1px solid #d0d0d0",
        "padding:2px 4px",
        `text-align:${align}`,
        `width:${sheet.widths[c]}px`,
        s.b && "font-weight:bold",
        s.i && "font-style:italic",
        (s.u || s.st) && `text-decoration:${[s.u && "underline", s.st && "line-through"].filter(Boolean).join(" ")}`,
        s.fc && `color:${s.fc}`,
        s.bg && `background:${s.bg}`,
        s.fs && `font-size:${s.fs}pt`,
        s.ff && `font-family:${s.ff}`,
        s.wrap ? "white-space:pre-wrap" : "white-space:nowrap",
      ]
        .filter(Boolean)
        .join(";");
      const span = merge ? ` rowspan="${merge.r2 - merge.r1 + 1}" colspan="${merge.c2 - merge.c1 + 1}"` : "";
      html += `<td${span} style="${css}">${escape(wb.display(sheetId, r, c))}</td>`;
    }
    html += "</tr>";
  }
  return `${html}</table>`;
}
