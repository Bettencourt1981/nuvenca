import type { Node } from "./parse";
import type { IdRef, Ref } from "./tokenize";
import {
  err,
  formatGeneral,
  isError,
  isMatrix,
  scalar,
  toNumber,
  toText,
  type Matrix,
  type Scalar,
  type Value,
} from "./values";
import { FUNCTIONS } from "./functions";

export type ResolvedRef = { sheetId: string; row?: number; col?: number };

/** What the evaluator needs from the workbook. */
export interface EvalContext {
  sheetId: string;
  row: number;
  col: number;
  locale: string;
  resolve(ref: IdRef): ResolvedRef | null;
  cellValue(sheetId: string, row: number, col: number): Scalar;
  /** Rows/columns that contain data (bounds whole-column references). */
  usedSize(sheetId: string): { rows: number; cols: number };
  now(): Date;
}

export type Area = { sheetId: string; r1: number; c1: number; r2: number; c2: number };

/** The cells a reference or range covers, or null if it points at deleted cells. */
export function areaOf(node: Node, ctx: EvalContext): Area | null {
  const one = (ref: Ref) => (ref.kind === "id" ? ctx.resolve(ref) : null);
  if (node.t === "ref") {
    const r = one(node.ref);
    if (!r) return null;
    const used = ctx.usedSize(r.sheetId);
    return {
      sheetId: r.sheetId,
      r1: r.row ?? 0,
      r2: r.row ?? Math.max(used.rows - 1, 0),
      c1: r.col ?? 0,
      c2: r.col ?? Math.max(used.cols - 1, 0),
    };
  }
  if (node.t === "range") {
    const a = one(node.from);
    const b = one(node.to);
    if (!a || !b) return null;
    const used = ctx.usedSize(a.sheetId);
    const rows = [a.row, b.row];
    const cols = [a.col, b.col];
    const r1 = rows[0] === undefined ? 0 : Math.min(rows[0], rows[1] ?? rows[0]);
    const r2 = rows[0] === undefined ? Math.max(used.rows - 1, 0) : Math.max(rows[0], rows[1] ?? rows[0]);
    const c1 = cols[0] === undefined ? 0 : Math.min(cols[0], cols[1] ?? cols[0]);
    const c2 = cols[0] === undefined ? Math.max(used.cols - 1, 0) : Math.max(cols[0], cols[1] ?? cols[0]);
    return { sheetId: a.sheetId, r1, c1, r2, c2 };
  }
  return null;
}

export function readArea(area: Area, ctx: EvalContext): Matrix {
  const out: Matrix = [];
  for (let r = area.r1; r <= area.r2; r++) {
    const row: Scalar[] = [];
    for (let c = area.c1; c <= area.c2; c++) row.push(ctx.cellValue(area.sheetId, r, c));
    out.push(row);
  }
  return out;
}

/** Excel comparison: numbers < text < booleans; text is case-insensitive. */
export function compareValues(a: Scalar, b: Scalar): number {
  const rank = (v: Scalar) => (typeof v === "number" || v === null ? 0 : typeof v === "string" ? 1 : 2);
  if (a === null && typeof b === "string") a = "";
  if (b === null && typeof a === "string") b = "";
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 0) return (Number(a ?? 0) || 0) - (Number(b ?? 0) || 0);
  if (ra === 1) return String(a).localeCompare(String(b), undefined, { sensitivity: "base", numeric: false });
  return Number(a) - Number(b);
}

function binaryScalar(op: string, a: Scalar, b: Scalar): Scalar {
  if (isError(a)) return a;
  if (isError(b)) return b;
  switch (op) {
    case "&": {
      const ta = toText(a);
      const tb = toText(b);
      if (isError(ta)) return ta;
      if (isError(tb)) return tb;
      return ta + tb;
    }
    case "=":
      return compareValues(a, b) === 0 && sameKind(a, b);
    case "<>":
      return !(compareValues(a, b) === 0 && sameKind(a, b));
    case "<":
      return compareValues(a, b) < 0;
    case ">":
      return compareValues(a, b) > 0;
    case "<=":
      return compareValues(a, b) <= 0;
    case ">=":
      return compareValues(a, b) >= 0;
  }
  const x = toNumber(a);
  const y = toNumber(b);
  if (isError(x)) return x;
  if (isError(y)) return y;
  let result: number;
  switch (op) {
    case "+":
      result = x + y;
      break;
    case "-":
      result = x - y;
      break;
    case "*":
      result = x * y;
      break;
    case "/":
      if (y === 0) return err("#DIV/0!");
      result = x / y;
      break;
    case "^":
      result = Math.pow(x, y);
      break;
    default:
      return err("#ERROR!");
  }
  return Number.isFinite(result) ? result : err("#NUM!");
}

// "1" = 1 is FALSE in Excel; blank equals both 0 and "".
function sameKind(a: Scalar, b: Scalar): boolean {
  if (a === null || b === null) return true;
  return typeof a === typeof b;
}

/** Apply a scalar operation elementwise when one side is a range. */
function broadcast(a: Value, b: Value, fn: (x: Scalar, y: Scalar) => Scalar): Value {
  if (!isMatrix(a) && !isMatrix(b)) return fn(a, b);
  const ma = isMatrix(a) ? a : null;
  const mb = isMatrix(b) ? b : null;
  const rows = Math.max(ma?.length ?? 1, mb?.length ?? 1);
  const cols = Math.max(ma?.[0]?.length ?? 1, mb?.[0]?.length ?? 1);
  const out: Matrix = [];
  for (let r = 0; r < rows; r++) {
    const row: Scalar[] = [];
    for (let c = 0; c < cols; c++) {
      const x = ma ? (ma[r]?.[c] ?? err("#N/A")) : (a as Scalar);
      const y = mb ? (mb[r]?.[c] ?? err("#N/A")) : (b as Scalar);
      row.push(fn(x, y));
    }
    out.push(row);
  }
  return out;
}

function map(value: Value, fn: (x: Scalar) => Scalar): Value {
  return isMatrix(value) ? value.map((row) => row.map(fn)) : fn(value);
}

export function evaluate(node: Node, ctx: EvalContext): Value {
  switch (node.t) {
    case "num":
      return node.v;
    case "str":
      return node.v;
    case "bool":
      return node.v;
    case "err":
      return err(node.v);
    case "empty":
      return null;
    case "name":
      return err("#NAME?");
    case "ref":
    case "range": {
      const area = areaOf(node, ctx);
      if (!area) return err("#REF!");
      if (node.t === "ref" && area.r1 === area.r2 && area.c1 === area.c2) {
        return ctx.cellValue(area.sheetId, area.r1, area.c1);
      }
      return readArea(area, ctx);
    }
    case "arr":
      return node.rows.map((row) => row.map((cell) => scalar(evaluate(cell, ctx))));
    case "neg":
      return map(evaluate(node.a, ctx), (x) => {
        const n = toNumber(x);
        return isError(n) ? n : -n;
      });
    case "pct":
      return map(evaluate(node.a, ctx), (x) => {
        const n = toNumber(x);
        return isError(n) ? n : n / 100;
      });
    case "bin":
      return broadcast(evaluate(node.a, ctx), evaluate(node.b, ctx), (x, y) => binaryScalar(node.op, x, y));
    case "fn": {
      const definition = FUNCTIONS[node.name] ?? FUNCTIONS[node.name.replace(/^_XLFN\./, "")];
      if (!definition) return err("#NAME?");
      if (node.args.length < (definition.min ?? 0) || node.args.length > (definition.max ?? Infinity)) return err("#N/A");
      if (definition.lazy) return definition.lazy(node.args, ctx);
      const args = node.args.map((arg) => evaluate(arg, ctx));
      return definition.fn!(args, ctx, node.args);
    }
  }
}

/** Final value of a formula cell: a single scalar (top-left of a range result). */
export function evaluateCell(node: Node, ctx: EvalContext): Scalar {
  const value = scalar(evaluate(node, ctx));
  if (typeof value === "number" && !Number.isFinite(value)) return err("#NUM!");
  return value;
}

export { formatGeneral };
