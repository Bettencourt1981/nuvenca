import { getTranslations } from "next-intl/server";
import { FileQuestion } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { fileCategory, FileIcon } from "./file-icon";

const TEXT_EXT = /\.(txt|md|csv|tsv|json|log|xml|ya?ml|js|ts|tsx|jsx|css|html|py|java|rb|go|rs|php|c|cpp|h|sh|sql)$/i;

/** Inline preview for common formats; a download prompt for everything else. */
export async function FilePreview({
  name,
  mimeType,
  sizeBytes,
  src,
  downloadHref,
}: {
  name: string;
  mimeType: string | null;
  sizeBytes: number;
  /** URL that serves the file inline. */
  src: string;
  downloadHref: string;
}) {
  const t = await getTranslations("file");
  const actions = await getTranslations("drive.actions");
  const category = fileCategory("file", name, mimeType);
  const frame = "h-[70vh] w-full rounded-xl border border-border bg-surface";

  if (category === "image") {
    return (
      <div className="flex justify-center rounded-xl bg-surface-muted p-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- user content served from Storage */}
        <img src={src} alt={name} className="max-h-[70vh] max-w-full rounded-lg object-contain" />
      </div>
    );
  }
  if (category === "pdf") return <iframe src={src} title={name} className={frame} />;
  if (category === "video") {
    return <video src={src} controls className="max-h-[70vh] w-full rounded-xl bg-black" />;
  }
  if (category === "audio") {
    return (
      <div className="rounded-xl border border-border bg-surface p-6">
        <audio src={src} controls className="w-full" />
      </div>
    );
  }
  if ((mimeType?.startsWith("text/") || TEXT_EXT.test(name)) && sizeBytes < 2 * 1024 * 1024) {
    return <iframe src={src} title={name} className={`${frame} bg-white`} sandbox="" />;
  }

  const office = category === "document" || category === "spreadsheet" || category === "presentation";
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center">
      {office ? <FileIcon kind="file" name={name} mimeType={mimeType} className="size-14" /> : <FileQuestion className="size-14 text-muted" aria-hidden />}
      <p className="mt-4 font-medium">{t("noPreview")}</p>
      <p className="mt-1 max-w-md text-sm text-muted">{office ? t("officeComingSoon") : t("noPreviewHint")}</p>
      <a href={downloadHref} className={buttonClasses({ className: "mt-6" })}>
        {actions("download")}
      </a>
    </div>
  );
}
