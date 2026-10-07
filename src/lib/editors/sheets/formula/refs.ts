import { columnName, quoteSheetName } from "../address";
import { tokenize, type A1Ref, type IdRef, type Token } from "./tokenize";

export type InternalizeContext = {
  /** Sheet the formula lives on. */
  sheetId: string;
  sheetIdByName(name: string): string | null;
  /** Id of the row/column at an index; may grow the sheet. */
  rowId(sheetId: string, index: number): string | null;
  colId(sheetId: string, index: number): string | null;
};

export type DisplayContext = {
  sheetId: string;
  sheetName(id: string): string | null;
  /** -1 when the row/column was deleted. */
  rowIndex(sheetId: string, rowId: string): number;
  colIndex(sheetId: string, colId: string): number;
};

function idText(ref: IdRef): string {
  return `{{${ref.sheetId ?? ""}|${ref.rowId ?? ""}|${ref.colId ?? ""}|${ref.absRow ? "R" : ""}${ref.absCol ? "C" : ""}}}`;
}

function toIdRef(ref: A1Ref, ctx: InternalizeContext): IdRef | null {
  const sheetId = ref.sheet ? ctx.sheetIdByName(ref.sheet) : ctx.sheetId;
  if (!sheetId) return null;
  const rowId = ref.row === undefined ? undefined : ctx.rowId(sheetId, ref.row);
  const colId = ref.col === undefined ? undefined : ctx.colId(sheetId, ref.col);
  if (rowId === null || colId === null) return null;
  return {
    kind: "id",
    sheetId: ref.sheet ? sheetId : undefined,
    rowId: rowId ?? undefined,
    colId: colId ?? undefined,
    absRow: ref.absRow,
    absCol: ref.absCol,
  };
}

/** "=SUM(A1:B2)" → "=SUM({{|r1|c1|}}:{{|r2|c2|}})" */
export function toInternal(formula: string, ctx: InternalizeContext): string {
  return tokenize(formula)
    .map((token) => {
      if (token.type === "ref" && token.ref.kind === "a1") {
        const ref = toIdRef(token.ref, ctx);
        return ref ? idText(ref) : "#REF!";
      }
      if (token.type === "range" && token.from.kind === "a1" && token.to.kind === "a1") {
        const from = toIdRef(token.from, ctx);
        const to = toIdRef({ ...token.to, sheet: token.from.sheet }, ctx);
        return from && to ? `${idText(from)}:${idText(to)}` : "#REF!";
      }
      return token.text;
    })
    .join("");
}

function a1Text(ref: IdRef, ctx: DisplayContext, withSheet: boolean): string | null {
  const sheetId = ref.sheetId ?? ctx.sheetId;
  let text = "";
  if (withSheet && ref.sheetId) {
    const name = ctx.sheetName(ref.sheetId);
    if (name === null) return null;
    text += `${quoteSheetName(name)}!`;
  }
  if (ref.colId !== undefined) {
    const col = ctx.colIndex(sheetId, ref.colId);
    if (col < 0) return null;
    text += `${ref.absCol ? "$" : ""}${columnName(col)}`;
  }
  if (ref.rowId !== undefined) {
    const row = ctx.rowIndex(sheetId, ref.rowId);
    if (row < 0) return null;
    text += `${ref.absRow ? "$" : ""}${row + 1}`;
  }
  return text;
}

/** Internal formula → what people see and edit (A1 notation). */
export function toDisplay(formula: string, ctx: DisplayContext): string {
  return tokenize(formula)
    .map((token) => {
      if (token.type === "ref" && token.ref.kind === "id") return a1Text(token.ref, ctx, true) ?? "#REF!";
      if (token.type === "range" && token.from.kind === "id" && token.to.kind === "id") {
        const from = a1Text(token.from, ctx, true);
        const to = a1Text({ ...token.to, sheetId: token.from.sheetId }, ctx, false);
        return from && to ? `${from}:${to}` : "#REF!";
      }
      return token.text;
    })
    .join("");
}

function shiftRef(ref: A1Ref, dRow: number, dCol: number): A1Ref | null {
  const row = ref.row === undefined || ref.absRow ? ref.row : ref.row + dRow;
  const col = ref.col === undefined || ref.absCol ? ref.col : ref.col + dCol;
  if ((row !== undefined && row < 0) || (col !== undefined && col < 0)) return null;
  return { ...ref, row, col };
}

function refToA1(ref: A1Ref, withSheet: boolean): string {
  let text = withSheet && ref.sheet ? `${quoteSheetName(ref.sheet)}!` : "";
  if (ref.col !== undefined) text += `${ref.absCol ? "$" : ""}${columnName(ref.col)}`;
  if (ref.row !== undefined) text += `${ref.absRow ? "$" : ""}${ref.row + 1}`;
  return text;
}

/** Move relative references, as when copying "=A1" from B1 to B2 gives "=A2". */
export function shiftFormula(formula: string, dRow: number, dCol: number): string {
  if (dRow === 0 && dCol === 0) return formula;
  return tokenize(formula)
    .map((token: Token) => {
      if (token.type === "ref" && token.ref.kind === "a1") {
        const ref = shiftRef(token.ref, dRow, dCol);
        return ref ? refToA1(ref, true) : "#REF!";
      }
      if (token.type === "range" && token.from.kind === "a1" && token.to.kind === "a1") {
        const from = shiftRef(token.from, dRow, dCol);
        const to = shiftRef(token.to, dRow, dCol);
        return from && to ? `${refToA1(from, true)}:${refToA1(to, false)}` : "#REF!";
      }
      return token.text;
    })
    .join("");
}

/** Every reference in an A1 formula, for highlighting while editing. */
export function a1References(formula: string): { sheet?: string; r1?: number; c1?: number; r2?: number; c2?: number }[] {
  const out: { sheet?: string; r1?: number; c1?: number; r2?: number; c2?: number }[] = [];
  for (const token of tokenize(formula)) {
    if (token.type === "ref" && token.ref.kind === "a1") {
      out.push({ sheet: token.ref.sheet, r1: token.ref.row, c1: token.ref.col, r2: token.ref.row, c2: token.ref.col });
    } else if (token.type === "range" && token.from.kind === "a1" && token.to.kind === "a1") {
      out.push({ sheet: token.from.sheet, r1: token.from.row, c1: token.from.col, r2: token.to.row, c2: token.to.col });
    }
  }
  return out;
}
