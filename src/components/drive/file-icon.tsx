import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  Presentation,
} from "lucide-react";
import { cn } from "@/lib/utils";

const DOC_EXT = /\.(docx?|odt|rtf|txt|md|pages)$/i;
const SHEET_EXT = /\.(xlsx?|ods|csv|tsv|numbers)$/i;
const SLIDE_EXT = /\.(pptx?|odp|key)$/i;
const ARCHIVE_EXT = /\.(zip|rar|7z|tar|gz|bz2)$/i;
const CODE_EXT = /\.(js|ts|tsx|jsx|json|html|css|py|java|rb|go|rs|php|c|cpp|h|sh|sql|xml|ya?ml)$/i;

export type FileCategory =
  | "folder"
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "document"
  | "spreadsheet"
  | "presentation"
  | "archive"
  | "code"
  | "other";

export function fileCategory(kind: "folder" | "file", name: string, mimeType: string | null): FileCategory {
  if (kind === "folder") return "folder";
  const mime = mimeType ?? "";
  if (mime === "application/vnd.nuvenca.document") return "document";
  if (mime === "application/vnd.nuvenca.spreadsheet") return "spreadsheet";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf" || /\.pdf$/i.test(name)) return "pdf";
  if (SHEET_EXT.test(name) || mime.includes("spreadsheet") || mime.includes("excel")) return "spreadsheet";
  if (SLIDE_EXT.test(name) || mime.includes("presentation") || mime.includes("powerpoint")) return "presentation";
  if (DOC_EXT.test(name) || mime.includes("wordprocessing") || mime === "application/msword" || mime.startsWith("text/plain"))
    return "document";
  if (ARCHIVE_EXT.test(name) || mime.includes("zip") || mime.includes("compressed")) return "archive";
  if (CODE_EXT.test(name)) return "code";
  return "other";
}

const ICONS: Record<FileCategory, { icon: typeof File; className: string }> = {
  folder: { icon: Folder, className: "text-amber-500 fill-amber-500/20" },
  image: { icon: FileImage, className: "text-rose-500" },
  video: { icon: FileVideo, className: "text-fuchsia-500" },
  audio: { icon: FileAudio, className: "text-violet-500" },
  pdf: { icon: FileText, className: "text-red-600" },
  document: { icon: FileText, className: "text-blue-600" },
  spreadsheet: { icon: FileSpreadsheet, className: "text-emerald-600" },
  presentation: { icon: Presentation, className: "text-orange-500" },
  archive: { icon: FileArchive, className: "text-stone-500" },
  code: { icon: FileCode, className: "text-cyan-600" },
  other: { icon: File, className: "text-muted" },
};

export function FileIcon({
  kind,
  name,
  mimeType,
  className,
}: {
  kind: "folder" | "file";
  name: string;
  mimeType: string | null;
  className?: string;
}) {
  const { icon: Icon, className: color } = ICONS[fileCategory(kind, name, mimeType)];
  return <Icon aria-hidden className={cn("size-5 shrink-0", color, className)} />;
}
