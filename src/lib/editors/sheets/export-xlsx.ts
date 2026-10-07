import "server-only";
import type * as Y from "yjs";

// Implemented with the spreadsheet engine.
export async function workbookToXlsx(_doc: Y.Doc): Promise<Uint8Array> {
  throw new Error("not_implemented");
}
