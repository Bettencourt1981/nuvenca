"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { columnName, normalize, type CellPos, type RangePos } from "@/lib/editors/sheets/address";
import type { SheetIndex, Workbook } from "@/lib/editors/sheets/engine";
import { isError } from "@/lib/editors/sheets/formula/values";
import { cellKey, type BorderSide, type CellStyle } from "@/lib/editors/sheets/model";
import { cn } from "@/lib/utils";
import {
  COL_HEADER_HEIGHT,
  ROW_HEADER_WIDTH,
  buildGeometry,
  visibleRange,
  type Geometry,
} from "./geometry";

export type Selection = { anchor: CellPos; focus: CellPos };
export type PeerCursor = { key: string; name: string; color: string; range: RangePos };
export type GridTarget = { kind: "cell" | "row" | "col" | "corner"; row: number; col: number };

export type GridHandle = {
  focus: () => void;
  scrollToCell: (pos: CellPos) => void;
};

type Quadrant = "corner" | "top" | "left" | "main";

function borderCss(side: BorderSide | undefined): string | undefined {
  if (!side) return undefined;
  const width = side.style === "thick" ? 3 : side.style === "medium" ? 2 : 1;
  return `${width}px ${side.style === "dashed" ? "dashed" : "solid"} ${side.color}`;
}

function textStyle(style: CellStyle | undefined): CSSProperties {
  if (!style) return {};
  const decorations = [style.u && "underline", style.st && "line-through"].filter(Boolean).join(" ");
  return {
    fontWeight: style.b ? 700 : undefined,
    fontStyle: style.i ? "italic" : undefined,
    textDecoration: decorations || undefined,
    color: style.fc,
    fontSize: style.fs ? `${(style.fs * 4) / 3}px` : undefined,
    fontFamily: style.ff,
  };
}

export const Grid = forwardRef<
  GridHandle,
  {
    wb: Workbook;
    version: number;
    sheetId: string;
    hiddenRows: Set<number>;
    selection: Selection;
    readOnly: boolean;
    peers: PeerCursor[];
    commentCells: Set<string>;
    /** Range references highlighted while typing a formula. */
    formulaRanges: { range: RangePos; color: string }[];
    editor: ReactNode | null;
    editingCell: CellPos | null;
    overlay?: (geometry: Geometry) => ReactNode;
    onSelect: (selection: Selection, options: { extend: boolean; dragging: boolean }) => void;
    onCellMouseDown?: (pos: CellPos, event: ReactMouseEvent) => boolean;
    onDoubleClick: (pos: CellPos) => void;
    onContextMenu: (target: GridTarget, event: ReactMouseEvent) => void;
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
    /** Text that arrives without a usable keydown: accents, dead keys, IME. */
    onTextInput?: (text: string) => void;
    onResizeCols: (c1: number, c2: number, width: number) => void;
    onResizeRows: (r1: number, r2: number, height: number) => void;
    onAutoFit: (col: number) => void;
  }
>(function Grid(props, ref) {
  const { wb, version, sheetId, hiddenRows, selection, peers, commentCells, formulaRanges } = props;
  const scroller = useRef<HTMLDivElement>(null);
  // Keeps keyboard focus while no cell is being edited, so composed input reaches us.
  const sink = useRef<HTMLTextAreaElement>(null);
  const focusGrid = () => (sink.current ?? scroller.current)?.focus({ preventScroll: true });
  const [scroll, setScroll] = useState({ top: 0, left: 0 });
  const [viewport, setViewport] = useState({ width: 1200, height: 800 });
  const [resizeGuide, setResizeGuide] = useState<{ axis: "x" | "y"; position: number } | null>(null);
  const dragging = useRef<null | { kind: "cells" | "rows" | "cols" }>(null);
  const frame = useRef<number | null>(null);

  const sheet = wb.sheet(sheetId) as SheetIndex;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` changes whenever the document does
  const geometry = useMemo(() => buildGeometry(sheet, hiddenRows), [sheet, hiddenRows, version]);
  const visible = visibleRange(geometry, scroll, viewport);
  const range = normalize({ r1: selection.anchor.row, c1: selection.anchor.col, r2: selection.focus.row, c2: selection.focus.col });

  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useImperativeHandle(ref, () => ({
    focus: focusGrid,
    scrollToCell: ({ row, col }) => {
      const element = scroller.current;
      if (!element) return;
      const g = geometry;
      if (row >= g.frozenRows) {
        const top = g.rowOffsets[row] - g.frozenHeight;
        const bottom = g.rowOffsets[row + 1] - g.frozenHeight;
        const visibleHeight = element.clientHeight - COL_HEADER_HEIGHT - g.frozenHeight;
        if (top < element.scrollTop) element.scrollTop = top;
        else if (bottom > element.scrollTop + visibleHeight) element.scrollTop = bottom - visibleHeight;
      }
      if (col >= g.frozenCols) {
        const left = g.colOffsets[col] - g.frozenWidth;
        const right = g.colOffsets[col + 1] - g.frozenWidth;
        const visibleWidth = element.clientWidth - ROW_HEADER_WIDTH - g.frozenWidth;
        if (left < element.scrollLeft) element.scrollLeft = left;
        else if (right > element.scrollLeft + visibleWidth) element.scrollLeft = right - visibleWidth;
      }
    },
  }));

  const onScroll = () => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const element = scroller.current;
      if (element) setScroll({ top: element.scrollTop, left: element.scrollLeft });
    });
  };

  // ---------------------------------------------------------------------------
  // Mouse
  // ---------------------------------------------------------------------------

  const targetFrom = (event: { target: EventTarget | null }): GridTarget | null => {
    const element = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-kind]");
    if (!element) return null;
    return {
      kind: element.dataset.kind as GridTarget["kind"],
      row: Number(element.dataset.r ?? 0),
      col: Number(element.dataset.c ?? 0),
    };
  };

  useEffect(() => {
    const up = () => {
      dragging.current = null;
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  const lastRow = geometry.rowCount - 1;
  const lastCol = geometry.colCount - 1;

  const onMouseDown = (event: ReactMouseEvent) => {
    if (event.button !== 0) return;
    const target = targetFrom(event);
    if (!target) return;
    focusGrid();
    if (target.kind === "cell") {
      const merge = sheet.covered.get(`${target.row}:${target.col}`);
      const pos = merge ? { row: merge.r1, col: merge.c1 } : { row: target.row, col: target.col };
      if (props.onCellMouseDown?.(pos, event)) {
        dragging.current = { kind: "cells" };
        return;
      }
      if (event.shiftKey) props.onSelect({ anchor: selection.anchor, focus: pos }, { extend: true, dragging: false });
      else props.onSelect({ anchor: pos, focus: pos }, { extend: false, dragging: false });
      dragging.current = { kind: "cells" };
    } else if (target.kind === "col") {
      const anchor = event.shiftKey ? { row: 0, col: selection.anchor.col } : { row: 0, col: target.col };
      props.onSelect({ anchor, focus: { row: lastRow, col: target.col } }, { extend: event.shiftKey, dragging: false });
      dragging.current = { kind: "cols" };
    } else if (target.kind === "row") {
      const anchor = event.shiftKey ? { row: selection.anchor.row, col: 0 } : { row: target.row, col: 0 };
      props.onSelect({ anchor, focus: { row: target.row, col: lastCol } }, { extend: event.shiftKey, dragging: false });
      dragging.current = { kind: "rows" };
    } else {
      props.onSelect({ anchor: { row: 0, col: 0 }, focus: { row: lastRow, col: lastCol } }, { extend: false, dragging: false });
    }
    event.preventDefault();
  };

  const onMouseMove = (event: ReactMouseEvent) => {
    if (!dragging.current || event.buttons !== 1) return;
    const target = targetFrom(event);
    if (!target) return;
    if (dragging.current.kind === "cells" && target.kind === "cell") {
      if (props.onCellMouseDown?.({ row: target.row, col: target.col }, { ...event, type: "mousemove" } as ReactMouseEvent)) return;
      if (target.row !== selection.focus.row || target.col !== selection.focus.col)
        props.onSelect({ anchor: selection.anchor, focus: { row: target.row, col: target.col } }, { extend: true, dragging: true });
    } else if (dragging.current.kind === "cols" && (target.kind === "col" || target.kind === "cell")) {
      props.onSelect({ anchor: selection.anchor, focus: { row: lastRow, col: target.col } }, { extend: true, dragging: true });
    } else if (dragging.current.kind === "rows" && (target.kind === "row" || target.kind === "cell")) {
      props.onSelect({ anchor: selection.anchor, focus: { row: target.row, col: lastCol } }, { extend: true, dragging: true });
    }
  };

  const onDoubleClick = (event: ReactMouseEvent) => {
    const target = targetFrom(event);
    if (target?.kind !== "cell") return;
    const merge = sheet.covered.get(`${target.row}:${target.col}`);
    props.onDoubleClick(merge ? { row: merge.r1, col: merge.c1 } : { row: target.row, col: target.col });
  };

  const onContextMenu = (event: ReactMouseEvent) => {
    const target = targetFrom(event);
    if (!target) return;
    event.preventDefault();
    const inside = target.row >= range.r1 && target.row <= range.r2 && target.col >= range.c1 && target.col <= range.c2;
    if (!inside && target.kind === "cell") props.onSelect({ anchor: target, focus: target }, { extend: false, dragging: false });
    props.onContextMenu(target, event);
  };

  // Column/row resizing by dragging header edges.
  const startResize = (axis: "x" | "y", index: number, event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const offsets = axis === "x" ? geometry.colOffsets : geometry.rowOffsets;
    const start = axis === "x" ? event.clientX : event.clientY;
    const original = offsets[index + 1] - offsets[index];
    const headerBox = (event.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    const origin = axis === "x" ? headerBox.right : headerBox.bottom;
    let size = original;
    const move = (e: MouseEvent) => {
      size = Math.max(axis === "x" ? 20 : 14, original + (axis === "x" ? e.clientX : e.clientY) - start);
      const rootBox = scroller.current!.getBoundingClientRect();
      setResizeGuide({ axis, position: origin - original + size - (axis === "x" ? rootBox.left : rootBox.top) });
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setResizeGuide(null);
      if (size === original) return;
      const selectedWhole = axis === "x" ? range.r1 === 0 && range.r2 === lastRow : range.c1 === 0 && range.c2 === lastCol;
      const within = axis === "x" ? index >= range.c1 && index <= range.c2 : index >= range.r1 && index <= range.r2;
      const [a, b] = selectedWhole && within ? (axis === "x" ? [range.c1, range.c2] : [range.r1, range.r2]) : [index, index];
      if (axis === "x") props.onResizeCols(a, b, size);
      else props.onResizeRows(a, b, size);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // ---------------------------------------------------------------------------
  // Rendering helpers
  // ---------------------------------------------------------------------------

  const origin = (quadrant: Quadrant) => ({
    x: quadrant === "main" || quadrant === "top" ? geometry.frozenWidth : 0,
    y: quadrant === "main" || quadrant === "left" ? geometry.frozenHeight : 0,
  });

  const quadrantOf = (row: number, col: number): Quadrant =>
    row < geometry.frozenRows ? (col < geometry.frozenCols ? "corner" : "top") : col < geometry.frozenCols ? "left" : "main";

  const rect = (r: RangePos, quadrant: Quadrant) => {
    const o = origin(quadrant);
    return {
      left: geometry.colOffsets[r.c1] - o.x,
      top: geometry.rowOffsets[r.r1] - o.y,
      width: geometry.colOffsets[r.c2 + 1] - geometry.colOffsets[r.c1],
      height: geometry.rowOffsets[r.r2 + 1] - geometry.rowOffsets[r.r1],
    };
  };

  /** Merges shrink/expand the selection rectangle to whole merged areas. */
  const expanded = (r: RangePos): RangePos => {
    const out = { ...r };
    for (const m of sheet.merges) {
      if (m.r2 < out.r1 || m.r1 > out.r2 || m.c2 < out.c1 || m.c1 > out.c2) continue;
      out.r1 = Math.min(out.r1, m.r1);
      out.c1 = Math.min(out.c1, m.c1);
      out.r2 = Math.max(out.r2, m.r2);
      out.c2 = Math.max(out.c2, m.c2);
    }
    return out;
  };

  const renderCells = (rows: [number, number], cols: [number, number], quadrant: Quadrant) => {
    const o = origin(quadrant);
    const out: ReactNode[] = [];
    const drawn = new Set<string>();

    const drawCell = (r: number, c: number, span?: { r2: number; c2: number }) => {
      const key = `${r}:${c}`;
      if (drawn.has(key)) return;
      drawn.add(key);
      const cell = wb.cell(sheetId, r, c);
      const value = wb.value(sheetId, r, c);
      const text = value === null ? "" : wb.display(sheetId, r, c);
      const style = cell?.s;
      const numeric = typeof value === "number";
      const align = style?.ha ?? (numeric ? "right" : typeof value === "boolean" || isError(value) ? "center" : "left");
      const r2 = span?.r2 ?? r;
      const c2 = span?.c2 ?? c;
      const left = geometry.colOffsets[c] - o.x;
      const top = geometry.rowOffsets[r] - o.y;
      const width = geometry.colOffsets[c2 + 1] - geometry.colOffsets[c];
      const height = geometry.rowOffsets[r2 + 1] - geometry.rowOffsets[r];
      if (height === 0) return;

      // Text may flow into empty cells on its right, like other spreadsheets.
      let overflow = 0;
      if (text && !style?.wrap && align === "left" && !span && !numeric) {
        for (let next = c + 1; next <= Math.min(c + 20, geometry.colCount - 1); next++) {
          const neighbour = wb.cell(sheetId, r, next);
          if (neighbour?.v !== undefined || neighbour?.f !== undefined || sheet.covered.has(`${r}:${next}`)) break;
          overflow += geometry.colOffsets[next + 1] - geometry.colOffsets[next];
          if (overflow > 2000) break;
        }
      }

      const borders = style && (style.bt || style.br || style.bb || style.bl);
      const hasComment = commentCells.has(cellKey(sheet.rows[r], sheet.cols[c]));
      out.push(
        <div
          key={key}
          data-kind="cell"
          data-r={r}
          data-c={c}
          className="sheet-cell"
          style={{
            left,
            top,
            width,
            height,
            background: style?.bg,
            zIndex: span ? 2 : undefined,
          }}
        >
          {text ? (
            <span
              className={cn("sheet-text", style?.wrap && "sheet-wrap")}
              style={{
                ...textStyle(style),
                justifyContent: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start",
                textAlign: align,
                alignItems: style?.va === "top" ? "flex-start" : style?.va === "middle" ? "center" : "flex-end",
                width: width + overflow,
                background: overflow ? (style?.bg ?? "var(--sheet-bg)") : undefined,
                color: style?.fc ?? (isError(value) ? "var(--danger)" : undefined),
              }}
            >
              {text}
            </span>
          ) : null}
          {borders ? (
            <span
              className="sheet-borders"
              style={{ borderTop: borderCss(style?.bt), borderRight: borderCss(style?.br), borderBottom: borderCss(style?.bb), borderLeft: borderCss(style?.bl) }}
            />
          ) : null}
          {hasComment ? <span className="sheet-comment-marker" aria-hidden /> : null}
        </div>,
      );
    };

    for (const m of sheet.merges) {
      if (m.r2 < rows[0] || m.r1 > rows[1] || m.c2 < cols[0] || m.c1 > cols[1]) continue;
      if (quadrantOf(m.r1, m.c1) !== quadrant) continue;
      drawCell(m.r1, m.c1, { r2: m.r2, c2: m.c2 });
    }
    for (let r = rows[0]; r <= rows[1]; r++) {
      if (geometry.hidden.has(r)) continue;
      for (let c = cols[0]; c <= cols[1]; c++) {
        if (sheet.covered.has(`${r}:${c}`)) continue;
        drawCell(r, c);
      }
    }
    return out;
  };

  const renderOverlays = (quadrant: Quadrant) => {
    const out: ReactNode[] = [];
    formulaRanges.forEach(({ range: r, color }, index) => {
      out.push(<div key={`f${index}`} className="sheet-formula-range" style={{ ...rect(normalize(r), quadrant), borderColor: color, background: `${color}14` }} />);
    });
    for (const peer of peers) {
      const box = rect(expanded(normalize(peer.range)), quadrant);
      out.push(
        <div key={`p${peer.key}`} className="sheet-peer" style={{ ...box, borderColor: peer.color }}>
          {/* Keyed by position so the name shows again (then fades) whenever they move. */}
          <span key={`${peer.range.r1}:${peer.range.c1}:${peer.range.r2}:${peer.range.c2}`} className="sheet-peer-label" style={{ background: peer.color }}>
            {peer.name}
          </span>
        </div>,
      );
    }
    const selected = expanded(range);
    if (selected.r1 !== selected.r2 || selected.c1 !== selected.c2) {
      out.push(<div key="sel" className="sheet-selection" style={rect(selected, quadrant)} />);
    }
    const anchorMerge = sheet.merges.find((m) => m.r1 === selection.anchor.row && m.c1 === selection.anchor.col);
    const active = anchorMerge ?? { r1: selection.anchor.row, c1: selection.anchor.col, r2: selection.anchor.row, c2: selection.anchor.col };
    out.push(<div key="active" className="sheet-active" style={rect(active, quadrant)} />);
    if (props.editingCell && props.editor && quadrantOf(props.editingCell.row, props.editingCell.col) === quadrant) {
      const box = rect({ r1: props.editingCell.row, c1: props.editingCell.col, r2: props.editingCell.row, c2: props.editingCell.col }, quadrant);
      out.push(
        <div key="editor" className="sheet-editor-slot" style={{ left: box.left, top: box.top, minWidth: box.width, minHeight: box.height }}>
          {props.editor}
        </div>,
      );
    }
    return out;
  };

  const colHeader = (c: number, quadrant: "corner" | "top") => {
    const o = origin(quadrant);
    const selectedCol = c >= range.c1 && c <= range.c2;
    const whole = range.r1 === 0 && range.r2 === lastRow && selectedCol;
    return (
      <div
        key={`ch${c}`}
        data-kind="col"
        data-c={c}
        data-r={0}
        className={cn("sheet-col-header", selectedCol && "is-selected", whole && "is-whole")}
        style={{ left: geometry.colOffsets[c] - o.x + (quadrant === "corner" ? ROW_HEADER_WIDTH : 0), width: geometry.colOffsets[c + 1] - geometry.colOffsets[c] }}
      >
        {columnName(c)}
        {!props.readOnly ? (
          <span
            className="sheet-resize-x"
            onMouseDown={(event) => startResize("x", c, event)}
            onDoubleClick={(event) => {
              event.stopPropagation();
              props.onAutoFit(c);
            }}
          />
        ) : null}
      </div>
    );
  };

  const rowHeader = (r: number, quadrant: "corner" | "left") => {
    if (geometry.hidden.has(r)) return null;
    const o = origin(quadrant);
    const selectedRow = r >= range.r1 && r <= range.r2;
    const whole = range.c1 === 0 && range.c2 === lastCol && selectedRow;
    return (
      <div
        key={`rh${r}`}
        data-kind="row"
        data-r={r}
        data-c={0}
        className={cn("sheet-row-header", selectedRow && "is-selected", whole && "is-whole")}
        style={{ top: geometry.rowOffsets[r] - o.y + (quadrant === "corner" ? COL_HEADER_HEIGHT : 0), height: geometry.rowOffsets[r + 1] - geometry.rowOffsets[r] }}
      >
        {r + 1}
        {!props.readOnly ? <span className="sheet-resize-y" onMouseDown={(event) => startResize("y", r, event)} /> : null}
      </div>
    );
  };

  const frozenRowRange: [number, number] = [0, geometry.frozenRows - 1];
  const frozenColRange: [number, number] = [0, geometry.frozenCols - 1];
  const stickyLeftWidth = ROW_HEADER_WIDTH + geometry.frozenWidth;
  const stickyTopHeight = COL_HEADER_HEIGHT + geometry.frozenHeight;

  return (
    <div
      ref={scroller}
      tabIndex={0}
      role="grid"
      aria-rowcount={geometry.rowCount}
      aria-colcount={geometry.colCount}
      className="sheet-scroller"
      onScroll={onScroll}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onKeyDown={props.onKeyDown}
      onFocus={(event) => {
        if (event.target === event.currentTarget) focusGrid();
      }}
    >
      <div style={{ width: stickyLeftWidth + geometry.bodyWidth, height: stickyTopHeight + geometry.bodyHeight }}>
        {/* Top strip: column headers and frozen rows (sticks while scrolling down). */}
        <div className="sheet-sticky-top" style={{ height: stickyTopHeight }}>
          <div className="sheet-corner" style={{ width: stickyLeftWidth, height: stickyTopHeight }}>
            <div data-kind="corner" data-r={0} data-c={0} className="sheet-select-all" style={{ width: ROW_HEADER_WIDTH, height: COL_HEADER_HEIGHT }} />
            {geometry.frozenCols > 0 ? Array.from({ length: geometry.frozenCols }, (_, c) => colHeader(c, "corner")) : null}
            {geometry.frozenRows > 0 ? Array.from({ length: geometry.frozenRows }, (_, r) => rowHeader(r, "corner")) : null}
            {geometry.frozenRows > 0 && geometry.frozenCols > 0 ? (
              <div className="sheet-layer" style={{ left: ROW_HEADER_WIDTH, top: COL_HEADER_HEIGHT, width: geometry.frozenWidth, height: geometry.frozenHeight }}>
                {renderCells(frozenRowRange, frozenColRange, "corner")}
                {renderOverlays("corner")}
              </div>
            ) : null}
          </div>
          <div className="sheet-layer-flow" style={{ width: geometry.bodyWidth, height: stickyTopHeight }}>
            {Array.from({ length: visible.c2 - visible.c1 + 1 }, (_, i) => colHeader(visible.c1 + i, "top"))}
            {geometry.frozenRows > 0 ? (
              <div className="sheet-layer" style={{ left: 0, top: COL_HEADER_HEIGHT, width: geometry.bodyWidth, height: geometry.frozenHeight }}>
                {renderCells(frozenRowRange, [visible.c1, visible.c2], "top")}
                {renderOverlays("top")}
              </div>
            ) : null}
          </div>
        </div>

        {/* Body: row headers + frozen columns (sticks while scrolling right), then cells. */}
        <div className="flex">
          <div className="sheet-sticky-left" style={{ width: stickyLeftWidth, height: geometry.bodyHeight }}>
            {Array.from({ length: visible.r2 - visible.r1 + 1 }, (_, i) => rowHeader(visible.r1 + i, "left"))}
            {geometry.frozenCols > 0 ? (
              <div className="sheet-layer" style={{ left: ROW_HEADER_WIDTH, top: 0, width: geometry.frozenWidth, height: geometry.bodyHeight }}>
                {renderCells([visible.r1, visible.r2], frozenColRange, "left")}
                {renderOverlays("left")}
              </div>
            ) : null}
          </div>
          <div className="sheet-layer-flow" style={{ width: geometry.bodyWidth, height: geometry.bodyHeight }}>
            <div className="sheet-layer" style={{ inset: 0 }}>
              {renderCells([visible.r1, visible.r2], [visible.c1, visible.c2], "main")}
              {renderOverlays("main")}
              {props.overlay?.(geometry)}
            </div>
          </div>
        </div>
      </div>
      {resizeGuide ? (
        <div
          className="sheet-resize-guide"
          style={
            resizeGuide.axis === "x"
              ? { left: resizeGuide.position + (scroller.current?.scrollLeft ?? 0), top: scroller.current?.scrollTop ?? 0, width: 1, height: viewport.height }
              : { top: resizeGuide.position + (scroller.current?.scrollTop ?? 0), left: scroller.current?.scrollLeft ?? 0, height: 1, width: viewport.width }
          }
        />
      ) : null}
      <textarea
        ref={sink}
        className="sheet-input-sink"
        aria-hidden
        tabIndex={-1}
        inputMode="none"
        autoComplete="off"
        spellCheck={false}
        onInput={(event) => {
          if ((event.nativeEvent as InputEvent).isComposing) return;
          const text = event.currentTarget.value;
          event.currentTarget.value = "";
          if (text) props.onTextInput?.(text);
        }}
        onCompositionEnd={(event) => {
          const text = event.currentTarget.value || event.data;
          event.currentTarget.value = "";
          if (text) props.onTextInput?.(text);
        }}
      />
    </div>
  );
});

