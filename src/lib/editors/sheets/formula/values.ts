/** Values flowing through the formula engine (Excel semantics). */

export type ErrorCode = "#NULL!" | "#DIV/0!" | "#VALUE!" | "#REF!" | "#NAME?" | "#NUM!" | "#N/A" | "#CIRC!" | "#ERROR!";

export class FormulaError {
  constructor(readonly code: ErrorCode) {}
  toString() {
    return this.code;
  }
}

export type Scalar = number | string | boolean | null | FormulaError;
/** A range evaluates to a 2-D array (rows of columns). */
export type Matrix = Scalar[][];
export type Value = Scalar | Matrix;

export const ERRORS: Record<string, ErrorCode> = {
  "#NULL!": "#NULL!",
  "#DIV/0!": "#DIV/0!",
  "#VALUE!": "#VALUE!",
  "#REF!": "#REF!",
  "#NAME?": "#NAME?",
  "#NUM!": "#NUM!",
  "#N/A": "#N/A",
  "#CIRC!": "#CIRC!",
  "#ERROR!": "#ERROR!",
};

export const err = (code: ErrorCode) => new FormulaError(code);
export const isError = (value: unknown): value is FormulaError => value instanceof FormulaError;
export const isMatrix = (value: unknown): value is Matrix => Array.isArray(value);

/** First cell of a matrix, or the value itself. */
export function scalar(value: Value): Scalar {
  if (!isMatrix(value)) return value;
  return value[0]?.[0] ?? null;
}

export function toNumber(value: Scalar): number | FormulaError {
  if (isError(value)) return value;
  if (value === null || value === "") return 0;
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  const trimmed = value.trim();
  if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?%?$/i.test(trimmed)) {
    const n = parseFloat(trimmed);
    return trimmed.endsWith("%") ? n / 100 : n;
  }
  return err("#VALUE!");
}

export function toText(value: Scalar): string | FormulaError {
  if (isError(value)) return value;
  if (value === null) return "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return formatGeneral(value);
  return value;
}

export function toBool(value: Scalar): boolean | FormulaError {
  if (isError(value)) return value;
  if (value === null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const upper = value.trim().toUpperCase();
  if (upper === "TRUE") return true;
  if (upper === "FALSE") return false;
  return err("#VALUE!");
}

/** Numbers in "General" format, without float noise (0.1+0.2 → 0.3). */
export function formatGeneral(value: number): string {
  if (!Number.isFinite(value)) return "#NUM!";
  if (Number.isInteger(value) && Math.abs(value) < 1e15) return String(value);
  const precise = Number(value.toPrecision(15));
  const text = String(precise);
  return text.includes("e") ? precise.toExponential(5).replace(/\.?0+e/, "e") : text;
}

/** Flatten matrices and scalars into one list. */
export function flatten(values: Value[]): Scalar[] {
  const out: Scalar[] = [];
  for (const value of values) {
    if (isMatrix(value)) for (const row of value) out.push(...row);
    else out.push(value);
  }
  return out;
}
