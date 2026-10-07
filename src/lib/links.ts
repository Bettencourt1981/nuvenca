import type { FileItem } from "@/lib/types";

export function itemHref(item: Pick<FileItem, "id" | "kind">) {
  return item.kind === "folder" ? `/drive/folders/${item.id}` : `/file/${item.id}`;
}

export function downloadHref(id: string) {
  return `/api/files/${id}/download`;
}
