import { tokenize, type Ref, type Token } from "./tokenize";
import type { ErrorCode } from "./values";

export type Node =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "bool"; v: boolean }
  | { t: "err"; v: ErrorCode }
  | { t: "ref"; ref: Ref }
  | { t: "range"; from: Ref; to: Ref }
  | { t: "fn"; name: string; args: Node[] }
  | { t: "neg"; a: Node }
  | { t: "pct"; a: Node }
  | { t: "bin"; op: string; a: Node; b: Node }
  | { t: "arr"; rows: Node[][] }
  | { t: "name"; v: string }
  | { t: "empty" };

class ParseError extends Error {}

// Binary operator precedence (Excel): comparison < & < +- < */ < ^
const PRECEDENCE: Record<string, number> = {
  "=": 1, "<>": 1, "<": 1, ">": 1, "<=": 1, ">=": 1,
  "&": 2,
  "+": 3, "-": 3,
  "*": 4, "/": 4,
  "^": 5,
};

class Parser {
  private i = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.i];
  }
  private next(): Token {
    const token = this.tokens[this.i++];
    if (!token) throw new ParseError("unexpected end");
    return token;
  }
  private expect(text: string) {
    const token = this.next();
    if (token.text !== text) throw new ParseError(`expected ${text}`);
  }

  parse(): Node {
    if (this.tokens.length === 0) return { t: "empty" };
    const node = this.expression(0);
    if (this.i < this.tokens.length) throw new ParseError("unexpected token");
    return node;
  }

  private expression(minPrecedence: number): Node {
    let left = this.unary();
    for (;;) {
      const token = this.peek();
      if (!token || token.type !== "op" || !(token.text in PRECEDENCE)) break;
      const precedence = PRECEDENCE[token.text];
      if (precedence < minPrecedence) break;
      this.i++;
      // All binary operators are left-associative in Excel (including ^).
      const right = this.expression(precedence + 1);
      left = { t: "bin", op: token.text, a: left, b: right };
    }
    return left;
  }

  private unary(): Node {
    const token = this.peek();
    if (token?.type === "op" && (token.text === "-" || token.text === "+")) {
      this.i++;
      const operand = this.unary();
      return token.text === "-" ? { t: "neg", a: operand } : operand;
    }
    return this.postfix();
  }

  private postfix(): Node {
    let node = this.primary();
    while (this.peek()?.type === "op" && this.peek()!.text === "%") {
      this.i++;
      node = { t: "pct", a: node };
    }
    // Range between two references, e.g. A1:INDEX(...) is rare; plain refs are tokenised as ranges.
    return node;
  }

  private primary(): Node {
    const token = this.next();
    switch (token.type) {
      case "num":
        return { t: "num", v: token.value };
      case "str":
        return { t: "str", v: token.value };
      case "bool":
        return { t: "bool", v: token.value };
      case "err":
        return { t: "err", v: token.value };
      case "ref":
        return { t: "ref", ref: token.ref };
      case "range":
        return { t: "range", from: token.from, to: token.to };
      case "name":
        return { t: "name", v: token.text };
      case "func": {
        this.expect("(");
        const args: Node[] = [];
        if (this.peek()?.text === ")") {
          this.i++;
          return { t: "fn", name: token.name, args };
        }
        for (;;) {
          // Empty arguments (e.g. IF(A1,,2)) are allowed.
          const next = this.peek();
          if (next?.type === "sep" || next?.text === ")") args.push({ t: "empty" });
          else args.push(this.expression(0));
          const separator = this.next();
          if (separator.text === ")") break;
          if (separator.type !== "sep") throw new ParseError("expected separator");
        }
        return { t: "fn", name: token.name, args };
      }
      case "paren": {
        if (token.text !== "(") throw new ParseError("unexpected )");
        const inner = this.expression(0);
        this.expect(")");
        return inner;
      }
      case "brace": {
        if (token.text !== "{") throw new ParseError("unexpected }");
        const rows: Node[][] = [[]];
        for (;;) {
          rows[rows.length - 1].push(this.unary());
          const separator = this.next();
          if (separator.text === "}") break;
          if (separator.text === ";") rows.push([]);
          else if (separator.text !== ",") throw new ParseError("bad array");
        }
        return { t: "arr", rows };
      }
      default:
        throw new ParseError(`unexpected ${token.text}`);
    }
  }
}

/** Parse a formula (without the leading "="). Returns null on syntax errors. */
export function parseFormula(formula: string): Node | null {
  const tokens = tokenize(formula).filter((token) => token.type !== "ws");
  try {
    return new Parser(tokens).parse();
  } catch {
    return null;
  }
}
