"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import * as Y from "yjs";
import { fromBase64 } from "@/lib/collab/base64";
import { Workbook } from "@/lib/editors/sheets/engine";
import { filteredRows } from "@/lib/editors/sheets/ops";
import { Grid, type Selection } from "./grid";
import { ChartLayer } from "./charts";
import { SheetTabs } from "./sheet-tabs";
import "./sheet.css";

/** Read-only spreadsheet (version previews and public links). */
export function SpreadsheetViewer({ state, embedded = false }: { state: Uint8Array | string; embedded?: boolean }) {
  const locale = useLocale();
  const [doc] = useState(() => {
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, typeof state === "string" ? fromBase64(state) : state);
    return ydoc;
  });
  useEffect(() => () => doc.destroy(), [doc]);
  const wb = useMemo(() => new Workbook(doc, locale), [doc, locale]);
  const sheets = wb.sheets();
  const [activeId, setActiveId] = useState<string | null>(null);
  const sheetId = sheets.find((s) => s.id === activeId)?.id ?? sheets[0]?.id;
  const [selection, setSelection] = useState<Selection>({ anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } });
  const hidden = sheetId ? filteredRows(wb, sheetId) : new Set<number>();
  if (!sheetId) return null;

  return (
    <div className={`sheet-root flex flex-col ${embedded ? "min-h-0 flex-1" : "h-[70vh] overflow-hidden rounded-xl border border-border"}`}>
      <Grid
        wb={wb}
        version={0}
        sheetId={sheetId}
        hiddenRows={hidden}
        selection={selection}
        readOnly
        peers={[]}
        commentCells={new Set()}
        formulaRanges={[]}
        editor={null}
        editingCell={null}
        overlay={(geometry) => (
          <ChartLayer
            wb={wb}
            version={0}
            sheetId={sheetId}
            geometry={geometry}
            readOnly
            selectedId={null}
            onSelect={() => undefined}
            onEdit={() => undefined}
            onMove={() => undefined}
          />
        )}
        onSelect={setSelection}
        onDoubleClick={() => undefined}
        onContextMenu={() => undefined}
        onKeyDown={() => undefined}
        onResizeCols={() => undefined}
        onResizeRows={() => undefined}
        onAutoFit={() => undefined}
      />
      <SheetTabs
        sheets={sheets.map((s) => ({ id: s.id, name: s.name, color: s.color }))}
        activeId={sheetId}
        readOnly
        onSelect={setActiveId}
        onAdd={() => undefined}
        onRename={() => undefined}
        onDuplicate={() => undefined}
        onDelete={() => undefined}
        onMove={() => undefined}
      />
    </div>
  );
}
