import { format as numfmtFormat, parseValue } from "numfmt";
import { formatGeneral, isError, type Scalar } from "./formula/values";
import type { Cell } from "./model";

/** numfmt locale for the interface language (dates as day/month/year). */
export function sheetLocale(locale: string) {
  return locale === "pt" ? "pt-PT" : "en-GB";
}

export const NUMBER_FORMATS = {
  automatic: "",
  number: "#,##0.00",
  integer: "#,##0",
  percent: "0.00%",
  euro: "#,##0.00 €",
  dollar: "$#,##0.00",
  date: "dd/mm/yyyy",
  time: "hh:mm",
  datetime: "dd/mm/yyyy hh:mm",
  text: "@",
} as const;

export type ParsedInput =
  | { kind: "empty" }
  | { kind: "formula"; formula: string }
  | { kind: "value"; value: string | number | boolean; format?: string };

/** Interpret what someone typed into a cell. */
export function parseInput(text: string, locale: string): ParsedInput {
  if (text === "") return { kind: "empty" };
  if (text.startsWith("'")) return { kind: "value", value: text.slice(1) };
  if (text.startsWith("=") && text.length > 1) return { kind: "formula", formula: text.slice(1) };
  const upper = text.trim().toUpperCase();
  if (upper === "TRUE" || upper === "VERDADEIRO") return { kind: "value", value: true };
  if (upper === "FALSE" || upper === "FALSO") return { kind: "value", value: false };
  const parsed = parseValue(text.trim(), { locale: sheetLocale(locale) });
  if (parsed && typeof parsed.v === "number") {
    return { kind: "value", value: parsed.v, format: parsed.z && parsed.z !== "General" ? parsed.z : undefined };
  }
  return { kind: "value", value: text };
}

/** Text shown in a cell for a computed value. */
export function displayValue(value: Scalar, cell: Cell | undefined, locale: string): string {
  if (value === null) return "";
  if (isError(value)) return value.code;
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  const pattern = cell?.s?.nf;
  if (pattern && pattern !== "General") {
    try {
      return numfmtFormat(pattern, value, { locale: sheetLocale(locale), throws: false }) as string;
    } catch {
      // fall through to General
    }
  }
  if (typeof value === "number") {
    const text = formatGeneral(value);
    return locale === "pt" ? text.replace(".", ",") : text;
  }
  return value;
}

/** What the cell editor shows for a literal value. */
export function editableValue(cell: Cell | undefined, locale: string): string {
  const value = cell?.v;
  if (value === undefined || value === null) return "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") {
    const pattern = cell?.s?.nf;
    if (pattern && /[dmyhs]/i.test(pattern.replace(/"[^"]*"/g, "")) && !/0/.test(pattern)) {
      return displayValue(value, cell, locale);
    }
    if (pattern?.includes("%")) return `${displayValue(value * 100, undefined, locale)}%`;
    return displayValue(value, undefined, locale);
  }
  // Text that would otherwise be read as a number or formula keeps its apostrophe.
  const reparsed = parseInput(value, locale);
  return reparsed.kind === "value" && reparsed.value === value ? value : `'${value}`;
}
