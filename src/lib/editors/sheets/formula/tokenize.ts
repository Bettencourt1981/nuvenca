import { columnIndex } from "../address";
import { ERRORS, type ErrorCode } from "./values";

/**
 * Formula tokenizer. Formulas exist in two spellings:
 *  - A1 notation, as people type them: =SUM(A1:B3) * 'Sheet 2'!$C$1
 *  - internal notation, as stored: references point at row/column/sheet ids
 *    so they survive rows and columns being inserted, deleted or sorted by
 *    anyone, concurrently: {{sheetId|rowId|colId|flags}}
 * Every token keeps its original text so formulas can be rebuilt exactly.
 */

export type A1Ref = { kind: "a1"; sheet?: string; row?: number; col?: number; absRow: boolean; absCol: boolean };
export type IdRef = { kind: "id"; sheetId?: string; rowId?: string; colId?: string; absRow: boolean; absCol: boolean };
export type Ref = A1Ref | IdRef;

export type Token =
  | { type: "num"; text: string; value: number }
  | { type: "str"; text: string; value: string }
  | { type: "bool"; text: string; value: boolean }
  | { type: "err"; text: string; value: ErrorCode }
  | { type: "ref"; text: string; ref: Ref }
  | { type: "range"; text: string; from: Ref; to: Ref }
  | { type: "func"; text: string; name: string }
  | { type: "name"; text: string }
  | { type: "op"; text: string }
  | { type: "paren"; text: "(" | ")" }
  | { type: "sep"; text: string }
  | { type: "brace"; text: "{" | "}" }
  | { type: "ws"; text: string };

const SHEET = String.raw`(?:'((?:[^']|'')+)'|([A-Za-z_][A-Za-z0-9_.]*))!`;
const CELL = String.raw`(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})`;
const COL = String.raw`(\$?)([A-Za-z]{1,3})`;
const ROW = String.raw`(\$?)(\d{1,7})`;
const ID_REF = String.raw`\{\{([A-Za-z0-9]*)\|([A-Za-z0-9]*)\|([A-Za-z0-9]*)\|([RC]*)\}\}`;

const RE = {
  idRange: new RegExp(`^${ID_REF}:${ID_REF}`),
  idRef: new RegExp(`^${ID_REF}`),
  cellRange: new RegExp(`^(?:${SHEET})?${CELL}:${CELL}(?![A-Za-z0-9_(])`),
  cell: new RegExp(`^(?:${SHEET})?${CELL}(?![A-Za-z0-9_(.])`),
  colRange: new RegExp(`^(?:${SHEET})?${COL}:${COL}(?![A-Za-z0-9_(])`),
  rowRange: new RegExp(`^(?:${SHEET})?${ROW}:${ROW}(?![A-Za-z0-9_(.])`),
  number: /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/,
  ident: /^[A-Za-z_\\][A-Za-z0-9_.]*/,
  error: /^#(NULL!|DIV\/0!|VALUE!|REF!|NAME\?|NUM!|N\/A|CIRC!|ERROR!)/i,
  ws: /^\s+/,
};

const sheetName = (quoted?: string, plain?: string) => (quoted ? quoted.replace(/''/g, "'") : plain);

function idRef(sheet: string, row: string, col: string, flags: string): IdRef {
  return {
    kind: "id",
    sheetId: sheet || undefined,
    rowId: row || undefined,
    colId: col || undefined,
    absRow: flags.includes("R"),
    absCol: flags.includes("C"),
  };
}

export function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  let rest = formula;
  let previous: Token | null = null;

  const push = (token: Token, length: number) => {
    tokens.push(token);
    if (token.type !== "ws") previous = token;
    rest = rest.slice(length);
  };
  // A "-" or "+" is unary at the start, after an operator, "(", "," or "{".
  const operandExpected = () =>
    !previous || previous.type === "op" || previous.text === "(" || previous.type === "sep" || previous.text === "{";

  while (rest.length > 0) {
    let m: RegExpExecArray | null;
    const ch = rest[0];

    if ((m = RE.ws.exec(rest))) {
      push({ type: "ws", text: m[0] }, m[0].length);
    } else if (ch === '"') {
      let i = 1;
      let value = "";
      while (i < rest.length) {
        if (rest[i] === '"') {
          if (rest[i + 1] === '"') {
            value += '"';
            i += 2;
            continue;
          }
          break;
        }
        value += rest[i++];
      }
      push({ type: "str", text: rest.slice(0, i + 1), value }, i + 1);
    } else if ((m = RE.idRange.exec(rest))) {
      push({ type: "range", text: m[0], from: idRef(m[1], m[2], m[3], m[4]), to: idRef(m[5], m[6], m[7], m[8]) }, m[0].length);
    } else if ((m = RE.idRef.exec(rest))) {
      push({ type: "ref", text: m[0], ref: idRef(m[1], m[2], m[3], m[4]) }, m[0].length);
    } else if ((m = RE.cellRange.exec(rest))) {
      const sheet = sheetName(m[1], m[2]);
      push(
        {
          type: "range",
          text: m[0],
          from: { kind: "a1", sheet, absCol: !!m[3], col: columnIndex(m[4]), absRow: !!m[5], row: Number(m[6]) - 1 },
          to: { kind: "a1", sheet, absCol: !!m[7], col: columnIndex(m[8]), absRow: !!m[9], row: Number(m[10]) - 1 },
        },
        m[0].length,
      );
    } else if ((m = RE.cell.exec(rest)) && !/^(TRUE|FALSE)$/i.test(m[0])) {
      push(
        {
          type: "ref",
          text: m[0],
          ref: { kind: "a1", sheet: sheetName(m[1], m[2]), absCol: !!m[3], col: columnIndex(m[4]), absRow: !!m[5], row: Number(m[6]) - 1 },
        },
        m[0].length,
      );
    } else if ((m = RE.colRange.exec(rest))) {
      const sheet = sheetName(m[1], m[2]);
      push(
        {
          type: "range",
          text: m[0],
          from: { kind: "a1", sheet, absCol: !!m[3], col: columnIndex(m[4]), absRow: false },
          to: { kind: "a1", sheet, absCol: !!m[5], col: columnIndex(m[6]), absRow: false },
        },
        m[0].length,
      );
    } else if ((m = RE.rowRange.exec(rest)) && operandExpected()) {
      const sheet = sheetName(m[1], m[2]);
      push(
        {
          type: "range",
          text: m[0],
          from: { kind: "a1", sheet, absRow: !!m[3], row: Number(m[4]) - 1, absCol: false },
          to: { kind: "a1", sheet, absRow: !!m[5], row: Number(m[6]) - 1, absCol: false },
        },
        m[0].length,
      );
    } else if ((m = RE.number.exec(rest))) {
      push({ type: "num", text: m[0], value: parseFloat(m[0]) }, m[0].length);
    } else if ((m = RE.error.exec(rest))) {
      push({ type: "err", text: m[0], value: ERRORS[m[0].toUpperCase()] }, m[0].length);
    } else if ((m = RE.ident.exec(rest))) {
      const after = rest.slice(m[0].length).trimStart();
      if (after.startsWith("(")) push({ type: "func", text: m[0], name: m[0].toUpperCase() }, m[0].length);
      else if (/^(TRUE|FALSE)$/i.test(m[0])) push({ type: "bool", text: m[0], value: m[0].toUpperCase() === "TRUE" }, m[0].length);
      else push({ type: "name", text: m[0] }, m[0].length);
    } else if (rest.startsWith("<>") || rest.startsWith("<=") || rest.startsWith(">=")) {
      push({ type: "op", text: rest.slice(0, 2) }, 2);
    } else if ("+-*/^&=<>%:".includes(ch)) {
      push({ type: "op", text: ch }, 1);
    } else if (ch === "(" || ch === ")") {
      push({ type: "paren", text: ch }, 1);
    } else if (ch === "," || ch === ";") {
      push({ type: "sep", text: ch }, 1);
    } else if (ch === "{" || ch === "}") {
      push({ type: "brace", text: ch }, 1);
    } else {
      // Unknown character: keep it so the formula round-trips; parsing reports #ERROR!.
      push({ type: "name", text: ch }, 1);
    }
  }
  return tokens;
}
