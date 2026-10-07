"use client";

// Replaced by the read-only grid once the spreadsheet engine lands.
export function SpreadsheetViewer({ state }: { state: string }) {
  return <div data-state-length={state.length} />;
}
