import type { FileItem } from "@/lib/types";
import { nativeType } from "@/lib/editors/native";

export function itemHref(item: Pick<FileItem, "id" | "kind" | "mimeType">) {
  if (item.kind === "folder") return `/drive/folders/${item.id}`;
  const native = nativeType(item.mimeType);
  return native ? `/${native}/${item.id}` : `/file/${item.id}`;
}

export function downloadHref(id: string) {
  return `/api/files/${id}/download`;
}
