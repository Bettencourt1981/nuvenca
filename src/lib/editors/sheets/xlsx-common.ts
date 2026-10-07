// Helpers shared by .xlsx import (browser) and export (server).

/** Newer Excel functions are stored with a "_xlfn." prefix in files. */
export const FUTURE_FUNCTIONS = [
  "XLOOKUP", "IFS", "SWITCH", "TEXTJOIN", "CONCAT", "MAXIFS", "MINIFS", "XOR", "IFNA",
  "STDEV.S", "STDEV.P", "VAR.S", "VAR.P", "RANK.EQ", "DAYS", "UNIQUE", "FILTER", "SORT", "SEQUENCE",
];

export function addFutureFunctionPrefixes(formula: string): string {
  return formula.replace(/(^|[^A-Za-z0-9_.])([A-Za-z][A-Za-z0-9.]*)\(/g, (match, before: string, name: string) =>
    FUTURE_FUNCTIONS.includes(name.toUpperCase()) ? `${before}_xlfn.${name}(` : match,
  );
}

export function stripFutureFunctionPrefixes(formula: string): string {
  return formula.replace(/_xlfn\.(_xlws\.)?/gi, "");
}

/** "FF1A73E8" → "#1a73e8" (alpha ignored); undefined for theme colours. */
export function argbToHex(argb: string | undefined): string | undefined {
  if (!argb || !/^[0-9a-f]{8}$/i.test(argb)) return undefined;
  return `#${argb.slice(2).toLowerCase()}`;
}

export function hexToArgb(hex: string | undefined): string | undefined {
  if (!hex) return undefined;
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  return match ? `FF${match[1].toUpperCase()}` : undefined;
}

/** Excel column width (characters) ↔ pixels. */
export const widthToPx = (chars: number) => Math.round(chars * 7 + 5);
export const pxToWidth = (px: number) => Math.max(1, Math.round(((px - 5) / 7) * 100) / 100);
/** Row height in points ↔ pixels. */
export const pointsToPx = (pt: number) => Math.round((pt * 4) / 3);
export const pxToPoints = (px: number) => Math.round(((px * 3) / 4) * 100) / 100;
