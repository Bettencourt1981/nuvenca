"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowDownAZ, ArrowUpAZ } from "lucide-react";
import type { Workbook } from "@/lib/editors/sheets/engine";
import { Button } from "@/components/ui/button";

/** Drop-down for one filtered column: sort, pick the values to show. */
export function FilterMenu({
  wb,
  sheetId,
  col,
  rows,
  hidden,
  position,
  onSort,
  onApply,
  onClose,
}: {
  wb: Workbook;
  sheetId: string;
  col: number;
  /** Data rows of the filter range (header excluded). */
  rows: [number, number];
  hidden: string[];
  position: { x: number; y: number };
  onSort: (ascending: boolean) => void;
  onApply: (hidden: string[]) => void;
  onClose: () => void;
}) {
  const t = useTranslations("editor.sheets.filter");
  const common = useTranslations("common");
  const values = useMemo(() => {
    const set = new Set<string>();
    for (let r = rows[0]; r <= rows[1]; r++) set.add(wb.display(sheetId, r, col));
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [wb, sheetId, col, rows]);
  const [excluded, setExcluded] = useState(() => new Set(hidden));
  const [search, setSearch] = useState("");
  const shown = values.filter((v) => v.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50" onMouseDown={onClose}>
      <div
        className="absolute w-64 rounded-xl border border-border bg-surface p-3 text-sm shadow-xl"
        style={{ left: Math.min(position.x, window.innerWidth - 270), top: Math.min(position.y, window.innerHeight - 380) }}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-label={t("title")}
      >
        <button type="button" onClick={() => onSort(true)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-hover">
          <ArrowDownAZ className="size-4 text-muted" /> {t("sortAsc")}
        </button>
        <button type="button" onClick={() => onSort(false)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-hover">
          <ArrowUpAZ className="size-4 text-muted" /> {t("sortDesc")}
        </button>
        <hr className="my-2 border-border" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("search")}
          aria-label={t("search")}
          className="mb-2 h-8 w-full rounded-lg border border-border bg-surface px-2 focus:border-primary focus:outline-none"
        />
        <div className="mb-1 flex gap-3 text-xs">
          <button type="button" className="text-primary hover:underline" onClick={() => setExcluded(new Set())}>
            {t("selectAll")}
          </button>
          <button type="button" className="text-primary hover:underline" onClick={() => setExcluded(new Set(values))}>
            {t("clear")}
          </button>
        </div>
        <ul className="max-h-48 overflow-y-auto">
          {shown.map((value) => (
            <li key={value}>
              <label className="flex items-center gap-2 rounded px-1 py-1 hover:bg-surface-hover">
                <input
                  type="checkbox"
                  checked={!excluded.has(value)}
                  onChange={(event) => {
                    const next = new Set(excluded);
                    if (event.target.checked) next.delete(value);
                    else next.add(value);
                    setExcluded(next);
                  }}
                  className="accent-primary"
                />
                <span className="truncate">{value === "" ? t("blanks") : value}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>
            {common("cancel")}
          </Button>
          <Button size="sm" onClick={() => onApply([...excluded])}>
            {t("apply")}
          </Button>
        </div>
      </div>
    </div>
  );
}
