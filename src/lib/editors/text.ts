import * as Y from "yjs";
import { DOCUMENT_FIELD, type NativeType } from "./native";
import { sheetCells, sheetCols, sheetOrder, sheetRows, sheetsMap, type Cell } from "./sheets/model";

/** Matches `max_indexed_chars()` in the database. */
export const MAX_INDEXED_CHARS = 200_000;

function tidy(text: string): string {
  return text
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ ?\n[\s]*/g, "\n")
    .trim()
    .slice(0, MAX_INDEXED_CHARS);
}

/** The parts of Yjs XML types we read (duck-typed: bundles may hold two copies of Yjs). */
type XmlNode = {
  toArray?: () => XmlNode[];
  toDelta?: () => { insert?: unknown }[];
  nodeName?: string;
  hookName?: string;
};

/** Plain text of a rich-text document: one line per paragraph, heading, cell… */
export function documentText(doc: Y.Doc): string {
  const out: string[] = [];
  const walk = (node: XmlNode) => {
    if (typeof node.toDelta === "function") {
      for (const op of node.toDelta()) if (typeof op.insert === "string") out.push(op.insert);
      return;
    }
    if (node.hookName !== undefined || typeof node.toArray !== "function") return;
    for (const child of node.toArray()) walk(child);
    if (typeof node.nodeName === "string") out.push("\n");
  };
  walk(doc.getXmlFragment(DOCUMENT_FIELD) as unknown as XmlNode);
  return tidy(out.join(""));
}

/** Plain text of a spreadsheet: sheet names, then each row's literal values. */
export function spreadsheetText(doc: Y.Doc): string {
  const lines: string[] = [];
  for (const sheetId of sheetOrder(doc).toArray()) {
    const sheet = sheetsMap(doc).get(sheetId);
    if (!sheet) continue;
    lines.push(String(sheet.get("name") ?? ""));
    const rowIndex = new Map(sheetRows(sheet).toArray().map((id, i) => [id, i]));
    const colIndex = new Map(sheetCols(sheet).toArray().map((id, i) => [id, i]));
    const values: { r: number; c: number; text: string }[] = [];
    sheetCells(sheet).forEach((cell: Cell, key) => {
      if (cell.v === undefined || cell.v === null || cell.v === "") return;
      const [rowId, colId] = key.split(":");
      const r = rowIndex.get(rowId);
      const c = colIndex.get(colId);
      if (r === undefined || c === undefined) return;
      values.push({ r, c, text: String(cell.v) });
    });
    values.sort((a, b) => a.r - b.r || a.c - b.c);
    let row = -1;
    let line: string[] = [];
    for (const value of values) {
      if (value.r !== row) {
        if (line.length) lines.push(line.join(" "));
        line = [];
        row = value.r;
      }
      line.push(value.text);
    }
    if (line.length) lines.push(line.join(" "));
  }
  return tidy(lines.join("\n"));
}

export function nativeText(doc: Y.Doc, type: NativeType): string {
  return type === "document" ? documentText(doc) : spreadsheetText(doc);
}
