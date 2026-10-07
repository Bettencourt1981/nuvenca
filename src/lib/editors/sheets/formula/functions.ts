import * as formulajs from "@formulajs/formulajs";
import { dateFromSerial, dateToSerial, format as formatNumber } from "numfmt";
import type { Node } from "./parse";
import { areaOf, compareValues, evaluate, type EvalContext } from "./evaluate";
import {
  err,
  flatten,
  isError,
  isMatrix,
  scalar,
  toBool,
  toNumber,
  toText,
  FormulaError,
  type Matrix,
  type Scalar,
  type Value,
} from "./values";

type EagerFn = (args: Value[], ctx: EvalContext, nodes: Node[]) => Value;
type LazyFn = (args: Node[], ctx: EvalContext) => Value;
export type FunctionDef = { min?: number; max?: number; fn?: EagerFn; lazy?: LazyFn };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const firstError = (values: Scalar[]) => values.find(isError) as FormulaError | undefined;

/** Numbers from arguments: direct arguments are coerced, numbers inside ranges are taken as is. */
function numbers(args: Value[], options: { countText?: boolean } = {}): number[] | FormulaError {
  const out: number[] = [];
  for (const arg of args) {
    if (isMatrix(arg)) {
      for (const row of arg)
        for (const v of row) {
          if (isError(v)) return v;
          if (typeof v === "number") out.push(v);
          else if (options.countText && v !== null) out.push(typeof v === "boolean" ? Number(v) : 0);
        }
    } else {
      if (arg === null) continue;
      const n = toNumber(arg);
      if (isError(n)) return n;
      out.push(n);
    }
  }
  return out;
}

function num(value: Value): number | FormulaError {
  return toNumber(scalar(value));
}

function text(value: Value): string | FormulaError {
  return toText(scalar(value));
}

function bool(value: Value): boolean | FormulaError {
  return toBool(scalar(value));
}

function asMatrix(value: Value): Matrix {
  return isMatrix(value) ? value : [[value]];
}

const round = (n: number, digits: number, mode: "round" | "up" | "down") => {
  const factor = Math.pow(10, digits);
  const scaled = Math.abs(n) * factor;
  // Guard against float noise (2.675 → 2.68 like Excel).
  const fixed = Number(scaled.toPrecision(15));
  const r = mode === "round" ? Math.round(fixed) : mode === "up" ? Math.ceil(fixed) : Math.floor(fixed);
  return (Math.sign(n) * r) / factor;
};

function wildcardRegex(pattern: string): RegExp {
  let source = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "~" && i + 1 < pattern.length) source += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    else if (ch === "*") source += ".*";
    else if (ch === "?") source += ".";
    else source += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`, "i");
}

/** SUMIF/COUNTIF style criteria: 5, ">5", "<>x", "a*", "=". */
export function criteriaMatcher(criteria: Scalar): (value: Scalar) => boolean {
  if (typeof criteria === "number") return (v) => (typeof v === "number" ? v === criteria : typeof v === "string" && v.trim() !== "" && Number(v) === criteria);
  if (typeof criteria === "boolean") return (v) => v === criteria;
  if (criteria === null) return (v) => v === null || v === "";
  if (isError(criteria)) return (v) => isError(v) && v.code === criteria.code;
  const match = /^(<=|>=|<>|=|<|>)?([\s\S]*)$/.exec(criteria)!;
  const op = match[1] ?? "=";
  const operand = match[2];
  const numeric = operand.trim() !== "" && !Number.isNaN(Number(operand)) ? Number(operand) : null;
  if (operand === "") {
    if (op === "=") return (v) => v === null || v === "";
    if (op === "<>") return (v) => v !== null && v !== "";
  }
  if (numeric !== null) {
    return (v) => {
      if (typeof v !== "number") return op === "<>";
      switch (op) {
        case "=": return v === numeric;
        case "<>": return v !== numeric;
        case "<": return v < numeric;
        case ">": return v > numeric;
        case "<=": return v <= numeric;
        default: return v >= numeric;
      }
    };
  }
  if (op === "=" || op === "<>") {
    const regex = wildcardRegex(operand);
    return (v) => {
      const matches = typeof v === "string" ? regex.test(v) : v !== null && !isError(v) && regex.test(String(v));
      return op === "=" ? matches : !matches;
    };
  }
  return (v) => {
    if (typeof v !== "string") return false;
    const c = v.localeCompare(operand, undefined, { sensitivity: "base" });
    return op === "<" ? c < 0 : op === ">" ? c > 0 : op === "<=" ? c <= 0 : c >= 0;
  };
}

/** Pairs of (range, criteria) for the *IFS functions; returns matching positions. */
function matchMask(pairs: Value[], rows: number, cols: number): boolean[][] | FormulaError {
  const mask = Array.from({ length: rows }, () => Array<boolean>(cols).fill(true));
  for (let i = 0; i < pairs.length; i += 2) {
    const range = asMatrix(pairs[i]);
    if (range.length !== rows || (range[0]?.length ?? 0) !== cols) return err("#VALUE!");
    const test = criteriaMatcher(scalar(pairs[i + 1]));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (mask[r][c] && !test(range[r][c])) mask[r][c] = false;
  }
  return mask;
}

// Dates are Excel serial numbers (1900 date system).
export function serialFromParts(year: number, month: number, day: number): number {
  return dateToSerial([year, month, day]) as number;
}
export function partsFromSerial(serial: number) {
  const [y, m, d, h, mi, s] = dateFromSerial(serial) as number[];
  return { y, m, d, h, mi, s };
}
function serialFromDate(date: Date): number {
  return dateToSerial(date) as number;
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addMonths(serial: number, months: number, endOfMonth: boolean) {
  const { y, m, d } = partsFromSerial(serial);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const last = daysInMonth(year, month);
  return serialFromParts(year, month, endOfMonth ? last : Math.min(d, last));
}

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

function lookupIndex(values: Scalar[], target: Scalar, mode: number): number {
  // mode 0: exact (wildcards for text); 1: largest <= target (sorted asc); -1: smallest >= target (sorted desc)
  if (mode === 0) {
    const matcher = typeof target === "string" ? wildcardRegex(target) : null;
    return values.findIndex((v) =>
      matcher && typeof v === "string" ? matcher.test(v) : v !== null && compareValues(v, target) === 0 && typeof v === typeof target,
    );
  }
  let found = -1;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null || isError(v)) continue;
    const c = compareValues(v, target);
    if (mode === 1 ? c <= 0 : c >= 0) found = i;
    else break;
  }
  return found;
}

// ---------------------------------------------------------------------------
// formula.js bridge for the long tail of Excel functions
// ---------------------------------------------------------------------------

function toJs(value: Value): unknown {
  if (isMatrix(value)) return value.map((row) => row.map((v) => (isError(v) ? new Error(v.code) : v)));
  if (isError(value)) return new Error(value.code);
  return value;
}

function fromJs(result: unknown): Value {
  if (result instanceof Error) {
    const code = result.message as FormulaError["code"];
    return err(["#NULL!", "#DIV/0!", "#VALUE!", "#REF!", "#NAME?", "#NUM!", "#N/A"].includes(code) ? code : "#VALUE!");
  }
  if (result instanceof Date) return serialFromDate(result);
  if (typeof result === "number") return Number.isFinite(result) ? result : err("#NUM!");
  if (typeof result === "string" || typeof result === "boolean" || result === null) return result;
  if (result === undefined) return null;
  if (Array.isArray(result)) return (Array.isArray(result[0]) ? result : [result]).map((row: unknown[]) => row.map((v) => scalar(fromJs(v))));
  return err("#VALUE!");
}

function formulajsFunction(name: string): EagerFn | null {
  const parts = name.split(".");
  let target: unknown = formulajs;
  for (const part of parts) {
    target = (target as Record<string, unknown> | undefined)?.[part];
    if (target === undefined) return null;
  }
  if (typeof target !== "function") return null;
  const fn = target as (...args: unknown[]) => unknown;
  return (args) => {
    try {
      return fromJs(fn(...args.map(toJs)));
    } catch {
      return err("#VALUE!");
    }
  };
}

// ---------------------------------------------------------------------------
// Native functions
// ---------------------------------------------------------------------------

const F: Record<string, FunctionDef> = {};
const def = (names: string | string[], definition: FunctionDef) => {
  for (const name of Array.isArray(names) ? names : [names]) F[name] = definition;
};
const numeric = (fn: (...n: number[]) => number | FormulaError, min = 1, max = min): FunctionDef => ({
  min,
  max,
  fn: (args) => {
    const values: number[] = [];
    for (const arg of args) {
      const n = num(arg);
      if (isError(n)) return n;
      values.push(n);
    }
    const result = fn(...values);
    return typeof result === "number" && !Number.isFinite(result) ? err("#NUM!") : result;
  },
});

// Math & statistics -----------------------------------------------------------
def("SUM", { fn: (args) => { const n = numbers(args); return isError(n) ? n : n.reduce((a, b) => a + b, 0); } });
def("PRODUCT", { fn: (args) => { const n = numbers(args); return isError(n) ? n : n.reduce((a, b) => a * b, 1); } });
def("AVERAGE", { min: 1, fn: (args) => { const n = numbers(args); if (isError(n)) return n; return n.length ? n.reduce((a, b) => a + b, 0) / n.length : err("#DIV/0!"); } });
def("MIN", { fn: (args) => { const n = numbers(args); return isError(n) ? n : n.length ? Math.min(...n) : 0; } });
def("MAX", { fn: (args) => { const n = numbers(args); return isError(n) ? n : n.length ? Math.max(...n) : 0; } });
def("COUNT", { fn: (args) => flatten(args).filter((v) => typeof v === "number").length });
def("COUNTA", { fn: (args) => flatten(args).filter((v) => v !== null && v !== "").length });
def("COUNTBLANK", { min: 1, max: 1, fn: (args) => flatten(args).filter((v) => v === null || v === "").length });
def("MEDIAN", { min: 1, fn: (args) => {
  const n = numbers(args); if (isError(n)) return n; if (!n.length) return err("#NUM!");
  const s = [...n].sort((a, b) => a - b); const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
} });
def(["ROUND"], numeric((n, d = 0) => round(n, Math.trunc(d), "round"), 1, 2));
def(["ROUNDUP"], numeric((n, d = 0) => round(n, Math.trunc(d), "up"), 1, 2));
def(["ROUNDDOWN"], numeric((n, d = 0) => round(n, Math.trunc(d), "down"), 1, 2));
def("TRUNC", numeric((n, d = 0) => round(n, Math.trunc(d), "down"), 1, 2));
def("INT", numeric((n) => Math.floor(n)));
def("ABS", numeric((n) => Math.abs(n)));
def("SIGN", numeric((n) => Math.sign(n)));
def("SQRT", numeric((n) => (n < 0 ? err("#NUM!") : Math.sqrt(n))));
def("POWER", numeric((a, b) => Math.pow(a, b), 2));
def("EXP", numeric((n) => Math.exp(n)));
def("LN", numeric((n) => (n <= 0 ? err("#NUM!") : Math.log(n))));
def("LOG10", numeric((n) => (n <= 0 ? err("#NUM!") : Math.log10(n))));
def("LOG", numeric((n, base = 10) => (n <= 0 || base <= 0 || base === 1 ? err("#NUM!") : Math.log(n) / Math.log(base)), 1, 2));
def("MOD", numeric((a, b) => (b === 0 ? err("#DIV/0!") : a - b * Math.floor(a / b)), 2));
def("PI", { max: 0, fn: () => Math.PI });
def("RAND", { max: 0, fn: () => Math.random() });
def("RANDBETWEEN", numeric((a, b) => Math.floor(Math.random() * (Math.floor(b) - Math.ceil(a) + 1)) + Math.ceil(a), 2));
def("CEILING", numeric((n, s = 1) => (s === 0 ? 0 : Math.ceil(n / s) * s), 1, 2));
def("FLOOR", numeric((n, s = 1) => (s === 0 ? err("#DIV/0!") : Math.floor(n / s) * s), 1, 2));
def("SUMPRODUCT", { min: 1, fn: (args) => {
  const ms = args.map(asMatrix); const rows = ms[0].length; const cols = ms[0][0]?.length ?? 0;
  if (ms.some((m) => m.length !== rows || (m[0]?.length ?? 0) !== cols)) return err("#VALUE!");
  let total = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    let p = 1;
    for (const m of ms) { const v = m[r][c]; if (isError(v)) return v; p *= typeof v === "number" ? v : 0; }
    total += p;
  }
  return total;
} });
const kth = (descending: boolean): FunctionDef => ({ min: 2, max: 2, fn: (args) => {
  const n = numbers([args[0]]); const k = num(args[1]);
  if (isError(n)) return n; if (isError(k)) return k;
  const sorted = [...n].sort((a, b) => (descending ? b - a : a - b));
  return sorted[Math.ceil(k) - 1] ?? err("#NUM!");
} });
def("LARGE", kth(true));
def("SMALL", kth(false));
def(["RANK", "RANK.EQ"], { min: 2, max: 3, fn: (args) => {
  const v = num(args[0]); const n = numbers([args[1]]); const order = args[2] === undefined ? 0 : num(args[2]);
  if (isError(v)) return v; if (isError(n)) return n; if (isError(order)) return order;
  if (!n.includes(v)) return err("#N/A");
  return 1 + n.filter((x) => (order ? x < v : x > v)).length;
} });
const variance = (n: number[], sample: boolean) => {
  const mean = n.reduce((a, b) => a + b, 0) / n.length;
  return n.reduce((a, b) => a + (b - mean) ** 2, 0) / (n.length - (sample ? 1 : 0));
};
def(["VAR", "VAR.S"], { min: 1, fn: (args) => { const n = numbers(args); if (isError(n)) return n; return n.length < 2 ? err("#DIV/0!") : variance(n, true); } });
def(["VARP", "VAR.P"], { min: 1, fn: (args) => { const n = numbers(args); if (isError(n)) return n; return n.length < 1 ? err("#DIV/0!") : variance(n, false); } });
def(["STDEV", "STDEV.S"], { min: 1, fn: (args) => { const n = numbers(args); if (isError(n)) return n; return n.length < 2 ? err("#DIV/0!") : Math.sqrt(variance(n, true)); } });
def(["STDEVP", "STDEV.P"], { min: 1, fn: (args) => { const n = numbers(args); if (isError(n)) return n; return n.length < 1 ? err("#DIV/0!") : Math.sqrt(variance(n, false)); } });

// Conditional aggregation
def("SUMIF", { min: 2, max: 3, fn: (args) => {
  const range = asMatrix(args[0]); const sum = args[2] === undefined ? range : asMatrix(args[2]); const test = criteriaMatcher(scalar(args[1]));
  let total = 0;
  range.forEach((row, r) => row.forEach((v, c) => { const s = sum[r]?.[c]; if (test(v) && typeof s === "number") total += s; }));
  return total;
} });
def("COUNTIF", { min: 2, max: 2, fn: (args) => { const test = criteriaMatcher(scalar(args[1])); return flatten([args[0]]).filter(test).length; } });
def("AVERAGEIF", { min: 2, max: 3, fn: (args) => {
  const range = asMatrix(args[0]); const avg = args[2] === undefined ? range : asMatrix(args[2]); const test = criteriaMatcher(scalar(args[1]));
  const values: number[] = [];
  range.forEach((row, r) => row.forEach((v, c) => { const s = avg[r]?.[c]; if (test(v) && typeof s === "number") values.push(s); }));
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : err("#DIV/0!");
} });
const ifs = (aggregate: (values: number[]) => Scalar, offset: number): FunctionDef => ({
  min: offset + 2,
  fn: (args) => {
    const target = offset ? asMatrix(args[0]) : null;
    const pairs = args.slice(offset);
    if (pairs.length % 2) return err("#VALUE!");
    const first = asMatrix(pairs[0]);
    const rows = target?.length ?? first.length;
    const cols = target?.[0]?.length ?? first[0]?.length ?? 0;
    const mask = matchMask(pairs, rows, cols);
    if (isError(mask)) return mask;
    const values: number[] = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (!mask[r][c]) continue;
      if (!target) values.push(1);
      else if (typeof target[r][c] === "number") values.push(target[r][c] as number);
    }
    return aggregate(values);
  },
});
def("SUMIFS", ifs((v) => v.reduce((a, b) => a + b, 0), 1));
def("COUNTIFS", ifs((v) => v.length, 0));
def("AVERAGEIFS", ifs((v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : err("#DIV/0!")), 1));
def("MAXIFS", ifs((v) => (v.length ? Math.max(...v) : 0), 1));
def("MINIFS", ifs((v) => (v.length ? Math.min(...v) : 0), 1));

// Logic -------------------------------------------------------------------------
def("IF", { min: 1, max: 3, lazy: (args, ctx) => {
  const condition = bool(evaluate(args[0], ctx));
  if (isError(condition)) return condition;
  if (condition) return args[1] ? evaluate(args[1], ctx) : true;
  return args[2] ? evaluate(args[2], ctx) : false;
} });
def("IFS", { min: 2, lazy: (args, ctx) => {
  for (let i = 0; i + 1 < args.length; i += 2) {
    const condition = bool(evaluate(args[i], ctx));
    if (isError(condition)) return condition;
    if (condition) return evaluate(args[i + 1], ctx);
  }
  return err("#N/A");
} });
def("IFERROR", { min: 2, max: 2, lazy: (args, ctx) => { const v = evaluate(args[0], ctx); return isError(scalar(v)) ? evaluate(args[1], ctx) : v; } });
def("IFNA", { min: 2, max: 2, lazy: (args, ctx) => { const v = evaluate(args[0], ctx); const s = scalar(v); return isError(s) && s.code === "#N/A" ? evaluate(args[1], ctx) : v; } });
const logical = (combine: (values: boolean[]) => boolean): FunctionDef => ({ min: 1, fn: (args) => {
  const values: boolean[] = [];
  for (const v of flatten(args)) {
    if (v === null || (typeof v === "string" && isMatrixArg(args))) continue;
    const b = toBool(v);
    if (isError(b)) return b;
    values.push(b);
  }
  return values.length ? combine(values) : err("#VALUE!");
} });
const isMatrixArg = (args: Value[]) => args.some(isMatrix);
def("AND", logical((v) => v.every(Boolean)));
def("OR", logical((v) => v.some(Boolean)));
def("XOR", logical((v) => v.filter(Boolean).length % 2 === 1));
def("NOT", { min: 1, max: 1, fn: (args) => { const b = bool(args[0]); return isError(b) ? b : !b; } });
def("TRUE", { max: 0, fn: () => true });
def("FALSE", { max: 0, fn: () => false });
def("SWITCH", { min: 3, lazy: (args, ctx) => {
  const value = scalar(evaluate(args[0], ctx));
  if (isError(value)) return value;
  let i = 1;
  for (; i + 1 < args.length; i += 2) {
    const candidate = scalar(evaluate(args[i], ctx));
    if (compareValues(value, candidate) === 0) return evaluate(args[i + 1], ctx);
  }
  return i < args.length ? evaluate(args[i], ctx) : err("#N/A");
} });
def("CHOOSE", { min: 2, lazy: (args, ctx) => {
  const index = toNumber(scalar(evaluate(args[0], ctx)));
  if (isError(index)) return index;
  const i = Math.trunc(index);
  return i >= 1 && i < args.length ? evaluate(args[i], ctx) : err("#VALUE!");
} });

// Information ------------------------------------------------------------------
const is = (test: (v: Scalar) => boolean): FunctionDef => ({ min: 1, max: 1, fn: (args) => test(scalar(args[0])) });
def("ISBLANK", is((v) => v === null));
def("ISNUMBER", is((v) => typeof v === "number"));
def("ISTEXT", is((v) => typeof v === "string"));
def("ISNONTEXT", is((v) => typeof v !== "string"));
def("ISLOGICAL", is((v) => typeof v === "boolean"));
def("ISERROR", is((v) => isError(v)));
def("ISERR", is((v) => isError(v) && v.code !== "#N/A"));
def("ISNA", is((v) => isError(v) && v.code === "#N/A"));
const parity = (odd: boolean): FunctionDef => ({ min: 1, max: 1, fn: (args) => {
  const n = num(args[0]);
  return isError(n) ? n : Math.abs(Math.trunc(n)) % 2 === (odd ? 1 : 0);
} });
def("ISEVEN", parity(false));
def("ISODD", parity(true));
def("NA", { max: 0, fn: () => err("#N/A") });
def("ROW", { max: 1, lazy: (args, ctx) => { if (!args[0]) return ctx.row + 1; const a = areaOf(args[0], ctx); return a ? a.r1 + 1 : err("#REF!"); } });
def("COLUMN", { max: 1, lazy: (args, ctx) => { if (!args[0]) return ctx.col + 1; const a = areaOf(args[0], ctx); return a ? a.c1 + 1 : err("#REF!"); } });
def("ROWS", { min: 1, max: 1, fn: (args) => asMatrix(args[0]).length });
def("COLUMNS", { min: 1, max: 1, fn: (args) => asMatrix(args[0])[0]?.length ?? 0 });

// Lookup & reference ------------------------------------------------------------
def("VLOOKUP", { min: 3, max: 4, fn: (args) => {
  const target = scalar(args[0]); const table = asMatrix(args[1]); const col = num(args[2]);
  const approximate = args[3] === undefined ? true : bool(args[3]);
  if (isError(target)) return target; if (isError(col)) return col; if (isError(approximate)) return approximate;
  if (col < 1 || col > (table[0]?.length ?? 0)) return err("#REF!");
  const i = lookupIndex(table.map((row) => row[0]), target, approximate ? 1 : 0);
  return i < 0 ? err("#N/A") : table[i][Math.trunc(col) - 1];
} });
def("HLOOKUP", { min: 3, max: 4, fn: (args) => {
  const target = scalar(args[0]); const table = asMatrix(args[1]); const row = num(args[2]);
  const approximate = args[3] === undefined ? true : bool(args[3]);
  if (isError(target)) return target; if (isError(row)) return row; if (isError(approximate)) return approximate;
  if (row < 1 || row > table.length) return err("#REF!");
  const i = lookupIndex(table[0] ?? [], target, approximate ? 1 : 0);
  return i < 0 ? err("#N/A") : table[Math.trunc(row) - 1][i];
} });
def("MATCH", { min: 2, max: 3, fn: (args) => {
  const target = scalar(args[0]); const range = flatten([args[1]]); const mode = args[2] === undefined ? 1 : num(args[2]);
  if (isError(target)) return target; if (isError(mode)) return mode;
  const i = lookupIndex(range, target, Math.sign(mode));
  return i < 0 ? err("#N/A") : i + 1;
} });
def("INDEX", { min: 2, max: 3, fn: (args) => {
  const m = asMatrix(args[0]); let r = num(args[1]); let c = args[2] === undefined ? 1 : num(args[2]);
  if (isError(r)) return r; if (isError(c)) return c;
  if (m.length === 1 && args[2] === undefined) { c = r; r = 1; }
  r = Math.trunc(r); c = Math.trunc(c);
  if (r === 0) return m.map((row) => [row[c - 1] ?? err("#REF!")]);
  if (c === 0) return [m[r - 1] ?? [err("#REF!")]];
  return m[r - 1]?.[c - 1] ?? err("#REF!");
} });
def("XLOOKUP", { min: 3, max: 6, fn: (args) => {
  const target = scalar(args[0]); const lookup = flatten([args[1]]); const results = asMatrix(args[2]);
  const ifMissing = args[3] ?? err("#N/A"); const matchMode = args[4] === undefined ? 0 : num(args[4]);
  if (isError(target)) return target; if (isError(matchMode)) return matchMode;
  let i = lookupIndex(lookup, target, 0);
  if (i < 0 && matchMode !== 0) {
    let best = -1;
    lookup.forEach((v, idx) => {
      if (v === null || isError(v)) return;
      const c = compareValues(v, target);
      if (matchMode === -1 && c < 0 && (best < 0 || compareValues(v, lookup[best]) > 0)) best = idx;
      if (matchMode === 1 && c > 0 && (best < 0 || compareValues(v, lookup[best]) < 0)) best = idx;
    });
    i = best;
  }
  if (i < 0) return ifMissing;
  const vertical = asMatrix(args[1]).length > 1;
  return vertical ? (results[i]?.length === 1 ? results[i][0] : [results[i]]) : results.map((row) => [row[i]]);
} });

// Text -----------------------------------------------------------------------------
const textFn = (fn: (...t: string[]) => Scalar, min = 1, max = min): FunctionDef => ({ min, max, fn: (args) => {
  const values: string[] = [];
  for (const arg of args) { const t = text(arg); if (isError(t)) return t; values.push(t); }
  return fn(...values);
} });
def(["CONCATENATE", "CONCAT"], { fn: (args) => { const values = flatten(args); const e = firstError(values); if (e) return e; return values.map((v) => toText(v) as string).join(""); } });
def("TEXTJOIN", { min: 3, fn: (args) => {
  const delimiter = text(args[0]); const ignoreEmpty = bool(args[1]);
  if (isError(delimiter)) return delimiter; if (isError(ignoreEmpty)) return ignoreEmpty;
  const values = flatten(args.slice(2)); const e = firstError(values); if (e) return e;
  return values.map((v) => toText(v) as string).filter((v) => !ignoreEmpty || v !== "").join(delimiter);
} });
def("LEN", textFn((t) => t.length));
def("UPPER", textFn((t) => t.toUpperCase()));
def("LOWER", textFn((t) => t.toLowerCase()));
def("PROPER", textFn((t) => t.toLowerCase().replace(/(^|[^\p{L}])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())));
def("TRIM", textFn((t) => t.trim().replace(/ +/g, " ")));
def("EXACT", textFn((a, b) => a === b, 2));
def("REPT", { min: 2, max: 2, fn: (args) => { const t = text(args[0]); const n = num(args[1]); if (isError(t)) return t; if (isError(n)) return n; return n < 0 ? err("#VALUE!") : t.repeat(Math.trunc(n)); } });
def("LEFT", { min: 1, max: 2, fn: (args) => { const t = text(args[0]); const n = args[1] === undefined ? 1 : num(args[1]); if (isError(t)) return t; if (isError(n)) return n; return n < 0 ? err("#VALUE!") : t.slice(0, Math.trunc(n)); } });
def("RIGHT", { min: 1, max: 2, fn: (args) => { const t = text(args[0]); const n = args[1] === undefined ? 1 : num(args[1]); if (isError(t)) return t; if (isError(n)) return n; return n < 0 ? err("#VALUE!") : n === 0 ? "" : t.slice(-Math.trunc(n)); } });
def("MID", { min: 3, max: 3, fn: (args) => { const t = text(args[0]); const s = num(args[1]); const n = num(args[2]); if (isError(t)) return t; if (isError(s)) return s; if (isError(n)) return n; return s < 1 || n < 0 ? err("#VALUE!") : t.substr(Math.trunc(s) - 1, Math.trunc(n)); } });
def("SUBSTITUTE", { min: 3, max: 4, fn: (args) => {
  const t = text(args[0]); const from = text(args[1]); const to = text(args[2]);
  if (isError(t)) return t; if (isError(from)) return from; if (isError(to)) return to;
  if (!from) return t;
  if (args[3] === undefined) return t.split(from).join(to);
  const n = num(args[3]); if (isError(n)) return n;
  let count = 0;
  return t.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), (m) => (++count === Math.trunc(n) ? to : m));
} });
def("REPLACE", { min: 4, max: 4, fn: (args) => {
  const t = text(args[0]); const s = num(args[1]); const n = num(args[2]); const r = text(args[3]);
  if (isError(t)) return t; if (isError(s)) return s; if (isError(n)) return n; if (isError(r)) return r;
  return t.slice(0, Math.trunc(s) - 1) + r + t.slice(Math.trunc(s) - 1 + Math.trunc(n));
} });
const find = (caseSensitive: boolean): FunctionDef => ({ min: 2, max: 3, fn: (args) => {
  const needle = text(args[0]); const hay = text(args[1]); const start = args[2] === undefined ? 1 : num(args[2]);
  if (isError(needle)) return needle; if (isError(hay)) return hay; if (isError(start)) return start;
  const i = caseSensitive
    ? hay.indexOf(needle, Math.trunc(start) - 1)
    : hay.slice(Math.trunc(start) - 1).search(wildcardRegex(needle).source.replace(/^\^|\$$/g, "")) + (Math.trunc(start) - 1);
  return i < Math.trunc(start) - 1 || i < 0 ? err("#VALUE!") : i + 1;
} });
def("FIND", find(true));
def("SEARCH", find(false));
def("CHAR", { min: 1, max: 1, fn: (args) => { const n = num(args[0]); return isError(n) ? n : String.fromCharCode(Math.trunc(n)); } });
def("CODE", textFn((t) => (t ? t.charCodeAt(0) : err("#VALUE!"))));
def("T", { min: 1, max: 1, fn: (args) => { const v = scalar(args[0]); return typeof v === "string" ? v : ""; } });
def("N", { min: 1, max: 1, fn: (args) => { const v = scalar(args[0]); return typeof v === "number" ? v : typeof v === "boolean" ? Number(v) : isError(v) ? v : 0; } });
def("VALUE", { min: 1, max: 1, fn: (args) => { const v = scalar(args[0]); return typeof v === "number" ? v : toNumber(v); } });
def("TEXT", { min: 2, max: 2, fn: (args, ctx) => {
  const v = scalar(args[0]); const pattern = text(args[1]);
  if (isError(v)) return v; if (isError(pattern)) return pattern;
  try { return formatNumber(pattern, v, { locale: ctx.locale }); } catch { return err("#VALUE!"); }
} });

// Dates ------------------------------------------------------------------------------
def("TODAY", { max: 0, fn: (_, ctx) => { const d = ctx.now(); return serialFromParts(d.getFullYear(), d.getMonth() + 1, d.getDate()); } });
def("NOW", { max: 0, fn: (_, ctx) => { const d = ctx.now(); return serialFromParts(d.getFullYear(), d.getMonth() + 1, d.getDate()) + (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400; } });
def("DATE", numeric((y, m, d) => {
  const year = y < 1900 ? y + 1900 : y;
  const base = new Date(Date.UTC(year, Math.trunc(m) - 1, 1));
  return serialFromParts(base.getUTCFullYear(), base.getUTCMonth() + 1, 1) + Math.trunc(d) - 1;
}, 3));
def("TIME", numeric((h, m, s) => (((h * 3600 + m * 60 + s) / 86400) % 1 + 1) % 1, 3));
const datePart = (pick: (p: ReturnType<typeof partsFromSerial>) => number) => numeric((n) => (n < 0 ? err("#NUM!") : pick(partsFromSerial(n))));
def("YEAR", datePart((p) => p.y));
def("MONTH", datePart((p) => p.m));
def("DAY", datePart((p) => p.d));
def("HOUR", datePart((p) => p.h));
def("MINUTE", datePart((p) => p.mi));
def("SECOND", datePart((p) => p.s));
def("WEEKDAY", numeric((n, type = 1) => {
  const day = (Math.floor(n) + 6) % 7; // 0 = Sunday (serial 1 is Sunday 1900-01-01)
  if (type === 2) return ((day + 6) % 7) + 1;
  if (type === 3) return (day + 6) % 7;
  return day + 1;
}, 1, 2));
def("EDATE", numeric((s, m) => addMonths(Math.floor(s), Math.trunc(m), false), 2));
def("EOMONTH", numeric((s, m) => addMonths(Math.floor(s), Math.trunc(m), true), 2));
def("DAYS", numeric((end, start) => Math.floor(end) - Math.floor(start), 2));
def("DATEDIF", { min: 3, max: 3, fn: (args) => {
  const a = num(args[0]); const b = num(args[1]); const unit = text(args[2]);
  if (isError(a)) return a; if (isError(b)) return b; if (isError(unit)) return unit;
  if (a > b) return err("#NUM!");
  const p = partsFromSerial(a); const q = partsFromSerial(b);
  let months = (q.y - p.y) * 12 + (q.m - p.m);
  if (q.d < p.d) months--;
  switch (unit.toUpperCase()) {
    case "D": return Math.floor(b) - Math.floor(a);
    case "M": return months;
    case "Y": return Math.floor(months / 12);
    case "YM": return months % 12;
    case "MD": return q.d >= p.d ? q.d - p.d : q.d + daysInMonth(q.m === 1 ? q.y - 1 : q.y, q.m === 1 ? 12 : q.m - 1) - p.d;
    case "YD": { const anniversary = serialFromParts(q.y, p.m, Math.min(p.d, daysInMonth(q.y, p.m))); return anniversary <= b ? Math.floor(b) - anniversary : Math.floor(b) - serialFromParts(q.y - 1, p.m, Math.min(p.d, daysInMonth(q.y - 1, p.m))); }
    default: return err("#NUM!");
  }
} });
def("NETWORKDAYS", { min: 2, max: 3, fn: (args) => {
  const a = num(args[0]); const b = num(args[1]);
  if (isError(a)) return a; if (isError(b)) return b;
  const holidays = new Set(args[2] === undefined ? [] : flatten([args[2]]).filter((v): v is number => typeof v === "number").map(Math.floor));
  const [start, end, sign] = a <= b ? [Math.floor(a), Math.floor(b), 1] : [Math.floor(b), Math.floor(a), -1];
  let count = 0;
  for (let d = start; d <= end; d++) { const wd = (d + 6) % 7; if (wd !== 0 && wd !== 6 && !holidays.has(d)) count++; }
  return sign * count;
} });

export const FUNCTIONS: Record<string, FunctionDef> = new Proxy(F, {
  get(target, name: string) {
    if (name in target) return target[name];
    // Fall back to formula.js for the rest of the Excel catalogue (financial,
    // engineering, statistics…). Results are cached per name.
    const bridged = formulajsFunction(name);
    if (!bridged) return undefined;
    target[name] = { fn: bridged };
    return target[name];
  },
});

/** Every function name the engine knows, for autocomplete. */
export function functionNames(): string[] {
  const names = new Set(Object.keys(F));
  const visit = (obj: Record<string, unknown>, prefix: string) => {
    for (const [key, value] of Object.entries(obj)) {
      if (key !== key.toUpperCase() || key.startsWith("_")) continue;
      if (typeof value === "function") {
        names.add(prefix + key);
        visit(value as unknown as Record<string, unknown>, `${prefix}${key}.`);
      }
    }
  };
  visit(formulajs as unknown as Record<string, unknown>, "");
  return [...names].sort();
}
