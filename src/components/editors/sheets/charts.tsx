"use client";

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useTranslations } from "next-intl";
import { Pencil, Trash2, X } from "lucide-react";
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PieController,
  PointElement,
  ScatterController,
  Title,
  Tooltip,
  type ChartConfiguration,
} from "chart.js";
import type { Workbook } from "@/lib/editors/sheets/engine";
import type { Chart, ChartType } from "@/lib/editors/sheets/model";
import { isError } from "@/lib/editors/sheets/formula/values";
import { parseRange, rangeName } from "@/lib/editors/sheets/address";
import { Button } from "@/components/ui/button";
import { indexAt, type Geometry } from "./geometry";

ChartJS.register(
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PieController,
  PointElement,
  ScatterController,
  Title,
  Tooltip,
);

const SERIES_COLORS = ["#4285f4", "#ea4335", "#fbbc04", "#34a853", "#ff6d01", "#46bdc6", "#7baaf7", "#f07b72", "#fcd04f", "#71c287"];

export type ChartRange = { r1: number; c1: number; r2: number; c2: number };

export function chartRange(wb: Workbook, sheetId: string, chart: Chart): ChartRange | null {
  const sheet = wb.sheet(sheetId);
  if (!sheet) return null;
  const r1 = sheet.rowIndex.get(chart.range.r1);
  const r2 = sheet.rowIndex.get(chart.range.r2);
  const c1 = sheet.colIndex.get(chart.range.c1);
  const c2 = sheet.colIndex.get(chart.range.c2);
  if (r1 === undefined || r2 === undefined || c1 === undefined || c2 === undefined) return null;
  return { r1, c1, r2, c2 };
}

/** Turn a sheet range into Chart.js data (first column = labels, other columns = series). */
export function chartConfig(wb: Workbook, sheetId: string, chart: Chart): ChartConfiguration | null {
  const range = chartRange(wb, sheetId, chart);
  if (!range) return null;
  const headers = chart.headers ?? true;
  const firstDataRow = headers ? range.r1 + 1 : range.r1;
  const labelCol = range.c2 > range.c1 ? range.c1 : null;
  const seriesCols: number[] = [];
  for (let c = labelCol === null ? range.c1 : range.c1 + 1; c <= range.c2; c++) seriesCols.push(c);

  const labels: string[] = [];
  for (let r = firstDataRow; r <= range.r2; r++) labels.push(labelCol === null ? String(r - firstDataRow + 1) : wb.display(sheetId, r, labelCol));
  const numberAt = (r: number, c: number) => {
    const value = wb.value(sheetId, r, c);
    return typeof value === "number" && !isError(value) ? value : null;
  };
  const datasets = seriesCols.map((c, index) => {
    const color = SERIES_COLORS[index % SERIES_COLORS.length];
    const label = headers ? wb.display(sheetId, range.r1, c) : `${index + 1}`;
    const data = [];
    for (let r = firstDataRow; r <= range.r2; r++) data.push(numberAt(r, c));
    return {
      label,
      data,
      backgroundColor: chart.type === "pie" ? labels.map((_, i) => SERIES_COLORS[i % SERIES_COLORS.length]) : chart.type === "area" ? `${color}55` : color,
      borderColor: chart.type === "pie" ? "#fff" : color,
      fill: chart.type === "area",
      tension: 0.25,
      pointRadius: chart.type === "line" || chart.type === "area" ? 3 : undefined,
    };
  });

  if (chart.type === "scatter") {
    const xs: (number | null)[] = [];
    for (let r = firstDataRow; r <= range.r2; r++) xs.push(labelCol === null ? r - firstDataRow + 1 : numberAt(r, labelCol));
    return {
      type: "scatter",
      data: {
        datasets: datasets.map((d) => ({
          label: d.label,
          backgroundColor: d.borderColor,
          data: d.data.map((y, i) => ({ x: xs[i] ?? 0, y: y ?? 0 })).filter((p, i) => xs[i] !== null && d.data[i] !== null),
        })),
      },
      options: baseOptions(chart),
    };
  }

  const type = chart.type === "column" || chart.type === "bar" ? "bar" : chart.type === "area" ? "line" : chart.type;
  return {
    type: type as "bar" | "line" | "pie",
    data: { labels, datasets: chart.type === "pie" ? datasets.slice(0, 1) : datasets },
    options: { ...baseOptions(chart), indexAxis: chart.type === "bar" ? "y" : "x" },
  } as ChartConfiguration;
}

function baseOptions(chart: Chart) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
    plugins: {
      title: { display: Boolean(chart.title), text: chart.title ?? "", font: { size: 14 } },
      legend: { display: true, position: "bottom" as const },
    },
  };
}

function ChartCanvas({ config }: { config: ChartConfiguration | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const instance = useRef<ChartJS | null>(null);
  useEffect(() => {
    if (!canvas.current || !config) return;
    if (instance.current && (instance.current.config as { type?: string }).type === config.type) {
      instance.current.data = config.data;
      instance.current.options = config.options ?? {};
      instance.current.update("none");
    } else {
      instance.current?.destroy();
      instance.current = new ChartJS(canvas.current, config);
    }
  }, [config]);
  useEffect(() => () => instance.current?.destroy(), []);
  return <canvas ref={canvas} />;
}

/** Charts floating over the grid (main area). */
export function ChartLayer({
  wb,
  version,
  sheetId,
  geometry,
  readOnly,
  selectedId,
  onSelect,
  onEdit,
  onMove,
}: {
  wb: Workbook;
  version: number;
  sheetId: string;
  geometry: Geometry;
  readOnly: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onEdit: (id: string) => void;
  onMove: (id: string, patch: Partial<Chart>) => void;
}) {
  const t = useTranslations("editor.sheets.chart");
  const sheet = wb.sheet(sheetId);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number; dw: number; dh: number } | null>(null);
  if (!sheet) return null;

  const position = (chart: Chart) => {
    const r = sheet.rowIndex.get(chart.anchor.rowId) ?? 0;
    const c = sheet.colIndex.get(chart.anchor.colId) ?? 0;
    return {
      left: geometry.colOffsets[c] - geometry.frozenWidth + chart.anchor.dx,
      top: geometry.rowOffsets[r] - geometry.frozenHeight + chart.anchor.dy,
    };
  };

  const startDrag = (id: string, chart: Chart, mode: "move" | "resize", event: ReactMouseEvent) => {
    if (readOnly) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(id);
    const startX = event.clientX;
    const startY = event.clientY;
    let delta = { dx: 0, dy: 0, dw: 0, dh: 0 };
    const move = (e: MouseEvent) => {
      const x = e.clientX - startX;
      const y = e.clientY - startY;
      delta = mode === "move" ? { dx: x, dy: y, dw: 0, dh: 0 } : { dx: 0, dy: 0, dw: x, dh: y };
      setDrag({ id, ...delta });
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setDrag(null);
      if (mode === "resize") {
        if (delta.dw || delta.dh)
          onMove(id, { width: Math.max(200, chart.width + delta.dw), height: Math.max(150, chart.height + delta.dh) });
        return;
      }
      if (!delta.dx && !delta.dy) return;
      const p = position(chart);
      const left = Math.max(0, p.left + delta.dx) + geometry.frozenWidth;
      const top = Math.max(0, p.top + delta.dy) + geometry.frozenHeight;
      const col = indexAt(geometry.colOffsets, geometry.colCount, left);
      const row = indexAt(geometry.rowOffsets, geometry.rowCount, top);
      onMove(id, {
        anchor: {
          rowId: sheet.rows[row],
          colId: sheet.cols[col],
          dx: Math.round(left - geometry.colOffsets[col]),
          dy: Math.round(top - geometry.rowOffsets[row]),
        },
      });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <>
      {sheet.charts.map(([id, chart]) => {
        const p = position(chart);
        const active = drag?.id === id ? drag : null;
        const selected = selectedId === id;
        return (
          <div
            key={id}
            className={`sheet-chart ${selected ? "is-selected" : ""}`}
            style={{
              left: p.left + (active?.dx ?? 0),
              top: p.top + (active?.dy ?? 0),
              width: chart.width + (active?.dw ?? 0),
              height: chart.height + (active?.dh ?? 0),
              cursor: readOnly ? "default" : "move",
            }}
            onMouseDown={(event) => startDrag(id, chart, "move", event)}
            onDoubleClick={(event) => {
              event.stopPropagation();
              if (!readOnly) onEdit(id);
            }}
            role="img"
            aria-label={chart.title || t(`types.${chart.type}`)}
          >
            <div className="h-full w-full p-2">
              <ChartCanvas config={chartConfigMemo(wb, sheetId, chart, version)} />
            </div>
            {selected && !readOnly ? (
              <>
                <button
                  type="button"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={() => onEdit(id)}
                  className="absolute right-2 top-2 rounded-md bg-white/90 p-1 text-muted shadow hover:text-foreground"
                  aria-label={t("edit")}
                >
                  <Pencil className="size-4" />
                </button>
                <span
                  onMouseDown={(event) => startDrag(id, chart, "resize", event)}
                  className="absolute bottom-0 right-0 size-3 cursor-nwse-resize rounded-sm bg-[var(--sheet-accent)]"
                />
              </>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

// Chart.js configs are rebuilt only when the document changed.
const configCache = new WeakMap<Chart, { version: number; config: ChartConfiguration | null }>();
function chartConfigMemo(wb: Workbook, sheetId: string, chart: Chart, version: number) {
  const cached = configCache.get(chart);
  if (cached && cached.version === version) return cached.config;
  const config = chartConfig(wb, sheetId, chart);
  configCache.set(chart, { version, config });
  return config;
}

export function ChartEditorPanel({
  wb,
  sheetId,
  chart,
  onChange,
  onDelete,
  onClose,
}: {
  wb: Workbook;
  sheetId: string;
  chart: Chart;
  onChange: (patch: Partial<Chart>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("editor.sheets.chart");
  const range = chartRange(wb, sheetId, chart);
  const [rangeText, setRangeText] = useState(range ? rangeName(range) : "");
  const [rangeError, setRangeError] = useState(false);
  const sheet = wb.sheet(sheetId)!;
  const types: ChartType[] = ["column", "bar", "line", "area", "pie", "scatter"];

  return (
    <aside className="no-print flex h-full w-full flex-col border-l border-border bg-surface sm:w-80" aria-label={t("editor")}>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="font-semibold">{t("editor")}</h2>
        <button type="button" onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-surface-hover" aria-label={t("close")}>
          <X className="size-4" />
        </button>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto p-4 text-sm">
        <div>
          <p className="mb-2 font-medium">{t("type")}</p>
          <div className="grid grid-cols-3 gap-2">
            {types.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => onChange({ type })}
                className={`rounded-lg border px-2 py-2 text-xs ${chart.type === type ? "border-primary bg-primary-soft text-primary" : "border-border hover:bg-surface-hover"}`}
              >
                {t(`types.${type}`)}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="mb-1.5 block font-medium">{t("range")}</span>
          <input
            value={rangeText}
            onChange={(event) => setRangeText(event.target.value)}
            onBlur={() => {
              const parsed = parseRange(rangeText);
              if (!parsed || parsed.r2 >= sheet.rows.length || parsed.c2 >= sheet.cols.length) return setRangeError(true);
              setRangeError(false);
              onChange({ range: { r1: sheet.rows[parsed.r1], c1: sheet.cols[parsed.c1], r2: sheet.rows[parsed.r2], c2: sheet.cols[parsed.c2] } });
            }}
            className="h-9 w-full rounded-lg border border-border bg-surface px-2.5 font-mono focus:border-primary focus:outline-none"
            aria-invalid={rangeError}
          />
          {rangeError ? <span className="mt-1 block text-xs text-danger">{t("invalidRange")}</span> : null}
        </label>
        <label className="block">
          <span className="mb-1.5 block font-medium">{t("title")}</span>
          <input
            defaultValue={chart.title ?? ""}
            onBlur={(event) => onChange({ title: event.target.value.slice(0, 120) || undefined })}
            className="h-9 w-full rounded-lg border border-border bg-surface px-2.5 focus:border-primary focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={chart.headers ?? true} onChange={(event) => onChange({ headers: event.target.checked })} className="accent-primary" />
          {t("headers")}
        </label>
      </div>
      <div className="border-t border-border p-3">
        <Button variant="secondary" className="w-full" onClick={onDelete}>
          <Trash2 className="size-4" />
          {t("delete")}
        </Button>
      </div>
    </aside>
  );
}
