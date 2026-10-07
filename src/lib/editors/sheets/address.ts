/** Column index (0-based) → letters: 0 → A, 25 → Z, 26 → AA. */
export function columnName(index: number): string {
  let name = "";
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

/** Letters → column index (0-based). */
export function columnIndex(letters: string): number {
  let index = 0;
  for (const ch of letters.toUpperCase()) index = index * 26 + (ch.charCodeAt(0) - 64);
  return index - 1;
}

export type CellPos = { row: number; col: number };
export type RangePos = { r1: number; c1: number; r2: number; c2: number };

export function cellName(pos: CellPos): string {
  return `${columnName(pos.col)}${pos.row + 1}`;
}

export function rangeName(range: RangePos): string {
  const { r1, c1, r2, c2 } = normalize(range);
  return r1 === r2 && c1 === c2 ? cellName({ row: r1, col: c1 }) : `${cellName({ row: r1, col: c1 })}:${cellName({ row: r2, col: c2 })}`;
}

export function normalize(range: RangePos): RangePos {
  return {
    r1: Math.min(range.r1, range.r2),
    c1: Math.min(range.c1, range.c2),
    r2: Math.max(range.r1, range.r2),
    c2: Math.max(range.c1, range.c2),
  };
}

/** Parse "B3" or "B3:D10" (no sheet name) into indices. */
export function parseRange(text: string): RangePos | null {
  const match = /^\s*\$?([A-Za-z]{1,3})\$?(\d{1,7})(?::\$?([A-Za-z]{1,3})\$?(\d{1,7}))?\s*$/.exec(text);
  if (!match) return null;
  const r1 = Number(match[2]) - 1;
  const c1 = columnIndex(match[1]);
  const r2 = match[4] ? Number(match[4]) - 1 : r1;
  const c2 = match[3] ? columnIndex(match[3]) : c1;
  if (r1 < 0 || r2 < 0) return null;
  return normalize({ r1, c1, r2, c2 });
}

export function quoteSheetName(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(name) && !/^[A-Za-z]{1,3}\d+$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`;
}
