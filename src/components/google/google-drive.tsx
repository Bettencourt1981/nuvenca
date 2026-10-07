"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { CloudDownload } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { useErrorMessage } from "@/hooks/use-error-message";
import { DropdownItem } from "@/components/ui/dropdown";
import { useUploads, type UploadTarget } from "@/components/drive/upload-provider";
import {
  downloadDriveFile,
  getAccessToken,
  googleDriveConfigured,
  pickDriveFiles,
  preloadGoogle,
  saveToDrive,
} from "@/lib/google/drive";
import { importAsNativeFile } from "@/lib/editors/convert";

const errorKey = (error: unknown) => (error instanceof Error && /^[a-z_]+$/.test(error.message) ? error.message : "google_failed");

/**
 * "Import from Google Drive" (New menu). Google Docs and Sheets become Nuvenca
 * documents and spreadsheets; other files are uploaded as they are.
 */
export function GoogleDriveImportItem({ target }: { target: UploadTarget }) {
  const t = useTranslations("google");
  const editor = useTranslations("editor");
  const locale = useLocale();
  const message = useErrorMessage();
  const router = useRouter();
  const { upload } = useUploads();
  const [busy, setBusy] = useState(false);
  useEffect(preloadGoogle, []);
  if (!googleDriveConfigured()) return null;

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const accessToken = await getAccessToken();
      const picked = await pickDriveFiles({ accessToken, locale, title: t("pickerTitle") });
      if (picked.length === 0) return;
      const toastId = toast.loading(t("importing", { count: picked.length }));
      const opened: { id: string; type: "document" | "spreadsheet" }[] = [];
      const uploads: File[] = [];
      const failed: string[] = [];
      for (const file of picked) {
        try {
          const downloaded = await downloadDriveFile(file, accessToken);
          if (downloaded.kind === "file") {
            uploads.push(new File([downloaded.blob], downloaded.name, { type: downloaded.blob.type || file.mimeType }));
            continue;
          }
          const result = await importAsNativeFile({
            data: await downloaded.blob.arrayBuffer(),
            type: downloaded.kind,
            name: downloaded.name,
            workspaceId: target.workspaceId,
            parentId: target.parentId,
            locale,
            sheetName: editor("sheets.sheetName", { number: 1 }),
          });
          if ("error" in result) throw new Error(result.error);
          opened.push({ id: result.id, type: downloaded.kind });
        } catch (error) {
          failed.push(`${file.name}: ${message(errorKey(error))}`);
        }
      }
      if (uploads.length) upload(uploads, target);
      toast.dismiss(toastId);
      if (failed.length) toast.error(t("importFailed", { count: failed.length }), { description: failed.join("\n") });
      if (opened.length) toast.success(t("imported", { count: opened.length }));
      if (opened.length === 1 && picked.length === 1) router.push(`/${opened[0].type}/${opened[0].id}`);
      else router.refresh();
    } catch (error) {
      toast.error(message(errorKey(error)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownItem icon={<CloudDownload className="text-amber-600" />} onSelect={() => void run()} disabled={busy}>
      {t("import")}
    </DropdownItem>
  );
}

/**
 * "Save to Google Drive" for an open document or spreadsheet: exports it to
 * Word/Excel and uploads it to the person's Drive as a Google Doc/Sheet.
 * Returns null when Google Drive isn't configured.
 */
export function useSaveToGoogleDrive({
  fileId,
  name,
  type,
  beforeExport,
}: {
  fileId: string;
  name: string;
  type: "document" | "spreadsheet";
  beforeExport: () => Promise<void>;
}) {
  const t = useTranslations("google");
  const message = useErrorMessage();
  const save = useCallback(async () => {
    const toastId = toast.loading(t("saving"));
    try {
      const accessToken = await getAccessToken();
      await beforeExport();
      const response = await fetch(`/api/files/${fileId}/download`);
      if (!response.ok) throw new Error("google_failed");
      const created = await saveToDrive({ accessToken, name, data: await response.blob(), as: type });
      toast.success(t("saved"), {
        id: toastId,
        action: { label: t("openInGoogle"), onClick: () => window.open(created.url, "_blank", "noopener") },
      });
    } catch (error) {
      toast.error(message(errorKey(error)), { id: toastId });
    }
  }, [t, message, fileId, name, type, beforeExport]);
  return googleDriveConfigured() ? save : null;
}

/**
 * Loads Google's scripts while a menu with a Google Drive item is open, so the
 * consent popup can open right after the click. Nothing is loaded from Google
 * for people who never open such a menu.
 */
export function PreloadGoogle() {
  useEffect(preloadGoogle, []);
  return null;
}
