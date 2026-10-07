"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { FileSpreadsheet, FileText, FolderPlus, Plus, Share2, Upload } from "lucide-react";
import { createFolder } from "@/lib/actions/drive";
import { createNativeFile } from "@/lib/actions/documents";
import { useRouter } from "@/i18n/navigation";
import { useErrorMessage } from "@/hooks/use-error-message";
import { Button } from "@/components/ui/button";
import { DropdownContent, DropdownItem, DropdownMenu, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { NameDialog } from "./name-dialog";
import { ShareDialog } from "./share-dialog";
import { useUploads, type UploadTarget } from "./upload-provider";

/** "New" menu (folder, upload, editors) and the current folder's Share button. */
export function FolderToolbar({
  target,
  canEdit,
  shareFolder,
}: {
  target: UploadTarget & { label: string };
  canEdit: boolean;
  shareFolder?: { id: string; name: string } | null;
}) {
  const t = useTranslations("drive");
  const editor = useTranslations("editor");
  const actions = useTranslations("drive.actions");
  const message = useErrorMessage();
  const router = useRouter();
  const createNative = async (type: "document" | "spreadsheet") => {
    const result = await createNativeFile({
      workspaceId: target.workspaceId,
      parentId: target.parentId,
      name: type === "document" ? editor("docs.untitled") : editor("sheets.untitled"),
      type,
    });
    if (!result.ok) return void toast.error(message(result.error));
    router.push(`/${type}/${result.data.id}`);
  };
  const { upload } = useUploads();
  const fileInput = useRef<HTMLInputElement>(null);
  const [folderDialog, setFolderDialog] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  return (
    <div className="flex items-center gap-2">
      {shareFolder ? (
        <>
          <Button variant="secondary" onClick={() => setShareOpen(true)}>
            <Share2 className="size-4" />
            <span className="hidden sm:inline">{actions("share")}</span>
          </Button>
          {shareOpen ? (
            <ShareDialog open onOpenChange={setShareOpen} fileId={shareFolder.id} name={shareFolder.name} />
          ) : null}
        </>
      ) : null}

      {canEdit ? (
        <>
          <DropdownMenu>
            <DropdownTrigger asChild>
              <Button>
                <Plus className="size-4" />
                {t("new")}
              </Button>
            </DropdownTrigger>
            <DropdownContent>
              <DropdownItem icon={<FolderPlus />} onSelect={() => setFolderDialog(true)}>
                {t("newFolder")}
              </DropdownItem>
              <DropdownItem icon={<Upload />} onSelect={() => fileInput.current?.click()}>
                {t("uploadFiles")}
              </DropdownItem>
              <DropdownSeparator />
              <DropdownItem icon={<FileText className="text-blue-600" />} onSelect={() => createNative("document")}>
                {t("newDocument")}
              </DropdownItem>
              <DropdownItem icon={<FileSpreadsheet className="text-emerald-600" />} onSelect={() => createNative("spreadsheet")}>
                {t("newSpreadsheet")}
              </DropdownItem>
            </DropdownContent>
          </DropdownMenu>

          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length) upload(files, target);
              event.target.value = "";
            }}
          />

          {folderDialog ? (
          <NameDialog
            open
            onOpenChange={setFolderDialog}
            title={t("newFolder")}
            label={t("folderName")}
            initialValue={t("untitledFolder")}
            submitLabel={t("newFolder")}
            onSubmit={async (name) => {
              const result = await createFolder({ workspaceId: target.workspaceId, parentId: target.parentId, name });
              if (!result.ok) return message(result.error);
              toast.success(t("folderCreated"));
              return null;
            }}
          />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
