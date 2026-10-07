"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { FileSpreadsheet, FileText } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { createImportTarget } from "@/lib/actions/documents";
import { useErrorMessage } from "@/hooks/use-error-message";
import { Button } from "@/components/ui/button";
import type { NativeType } from "@/lib/editors/native";

/** Convert an uploaded Word/Excel/CSV file into a Nuvenca document or spreadsheet. */
export function useOpenWithNuvenca() {
  const router = useRouter();
  const message = useErrorMessage();
  const [pending, startTransition] = useTransition();
  const open = (sourceId: string) =>
    startTransition(async () => {
      const result = await createImportTarget({ sourceId });
      if (!result.ok) return void toast.error(message(result.error));
      router.push(`/${result.data.type}/${result.data.id}?import=${sourceId}`);
    });
  return { open, pending };
}

export function OpenWithButton({ sourceId, type }: { sourceId: string; type: NativeType }) {
  const t = useTranslations("drive.actions");
  const { open, pending } = useOpenWithNuvenca();
  const Icon = type === "document" ? FileText : FileSpreadsheet;
  return (
    <Button onClick={() => open(sourceId)} disabled={pending}>
      <Icon className="size-4" />
      {type === "document" ? t("openWithDocs") : t("openWithSheets")}
    </Button>
  );
}
