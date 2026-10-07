import type { SheetIndex } from "@/lib/editors/sheets/engine";

export const ROW_HEADER_WIDTH = 46;
export const COL_HEADER_HEIGHT = 24;

/** Pixel layout of a sheet: prefix sums of row heights and column widths. */
export type Geometry = {
  rowOffsets: Float64Array;
  colOffsets: Float64Array;
  rowCount: number;
  colCount: number;
  frozenRows: number;
  frozenCols: number;
  frozenHeight: number;
  frozenWidth: number;
  bodyHeight: number;
  bodyWidth: number;
  hidden: Set<number>;
};

export function buildGeometry(sheet: SheetIndex, hidden: Set<number>): Geometry {
  const rowOffsets = new Float64Array(sheet.rows.length + 1);
  for (let r = 0; r < sheet.rows.length; r++) rowOffsets[r + 1] = rowOffsets[r] + (hidden.has(r) ? 0 : sheet.heights[r]);
  const colOffsets = new Float64Array(sheet.cols.length + 1);
  for (let c = 0; c < sheet.cols.length; c++) colOffsets[c + 1] = colOffsets[c] + sheet.widths[c];
  const frozenHeight = rowOffsets[sheet.frozenRows];
  const frozenWidth = colOffsets[sheet.frozenCols];
  return {
    rowOffsets,
    colOffsets,
    rowCount: sheet.rows.length,
    colCount: sheet.cols.length,
    frozenRows: sheet.frozenRows,
    frozenCols: sheet.frozenCols,
    frozenHeight,
    frozenWidth,
    bodyHeight: rowOffsets[sheet.rows.length] - frozenHeight,
    bodyWidth: colOffsets[sheet.cols.length] - frozenWidth,
    hidden,
  };
}

/** First index whose span ends after `position`. */
export function indexAt(offsets: Float64Array, count: number, position: number): number {
  let lo = 0;
  let hi = count - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid + 1] <= position) lo = mid + 1;
    else hi = mid;
  }
  return Math.max(0, Math.min(lo, count - 1));
}

/** Visible, non-frozen rows and columns for a scroll position. */
export function visibleRange(
  geometry: Geometry,
  scroll: { top: number; left: number },
  viewport: { width: number; height: number },
  overscan = 3,
) {
  const top = geometry.frozenHeight + scroll.top;
  const bottom = top + Math.max(0, viewport.height - COL_HEADER_HEIGHT - geometry.frozenHeight);
  const left = geometry.frozenWidth + scroll.left;
  const right = left + Math.max(0, viewport.width - ROW_HEADER_WIDTH - geometry.frozenWidth);
  const r1 = Math.max(geometry.frozenRows, indexAt(geometry.rowOffsets, geometry.rowCount, top) - overscan);
  const r2 = Math.min(geometry.rowCount - 1, indexAt(geometry.rowOffsets, geometry.rowCount, bottom) + overscan);
  const c1 = Math.max(geometry.frozenCols, indexAt(geometry.colOffsets, geometry.colCount, left) - 1);
  const c2 = Math.min(geometry.colCount - 1, indexAt(geometry.colOffsets, geometry.colCount, right) + 1);
  return { r1, r2, c1, c2 };
}
