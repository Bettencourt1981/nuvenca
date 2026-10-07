// Native Nuvenca file types.
export const NATIVE_MIME = {
  document: "application/vnd.nuvenca.document",
  spreadsheet: "application/vnd.nuvenca.spreadsheet",
} as const;

export type NativeType = keyof typeof NATIVE_MIME;

export function nativeType(mimeType: string | null | undefined): NativeType | null {
  if (mimeType === NATIVE_MIME.document) return "document";
  if (mimeType === NATIVE_MIME.spreadsheet) return "spreadsheet";
  return null;
}

/** Office files that can be opened (converted) in a Nuvenca editor. */
export function importableAs(name: string, mimeType: string | null): NativeType | null {
  if (/\.docx$/i.test(name) || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    return "document";
  if (/\.(xlsx|csv)$/i.test(name) || mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || mimeType === "text/csv")
    return "spreadsheet";
  return null;
}

export function exportExtension(type: NativeType) {
  return type === "document" ? "docx" : "xlsx";
}

/** "Report.docx" → "Report" */
export function stripExtension(name: string) {
  return name.replace(/\.(docx?|xlsx?|csv|odt|ods)$/i, "") || name;
}

/** An empty Yjs update (state with no content). */
export const EMPTY_YJS_STATE_BASE64 = "AAA=";
