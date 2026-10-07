"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { History, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fromBase64 } from "@/lib/collab/base64";
import { errorCode } from "@/lib/errors";
import { useErrorMessage } from "@/hooks/use-error-message";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type Version = { id: string; label: string | null; createdAt: string; authorName: string | null };

/**
 * Lists saved versions. Picking one hands its content to the editor for a
 * read-only preview; the editor decides how to show and restore it.
 */
export function VersionHistoryPanel({
  fileId,
  selectedId,
  onSelect,
  onRestore,
  onSaveCurrent,
  onClose,
}: {
  fileId: string;
  selectedId: string | null;
  onSelect: (version: { id: string; state: Uint8Array } | null) => void;
  onRestore: () => Promise<void>;
  onSaveCurrent: (label: string) => Promise<void>;
  onClose: () => void;
}) {
  const t = useTranslations("editor.history");
  const format = useFormatter();
  const message = useErrorMessage();
  const [supabase] = useState(() => createClient());
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [version, setVersion] = useState(0);
  const [label, setLabel] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    supabase.rpc("list_document_versions", { p_file_id: fileId }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) toast.error(message(errorCode(error)));
      setVersions(
        (data ?? []).map((v) => ({ id: v.id, label: v.label, createdAt: v.created_at, authorName: v.author_name })),
      );
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `message` is stable in practice
  }, [supabase, fileId, version]);

  const select = useCallback(
    async (id: string) => {
      setLoadingId(id);
      const { data, error } = await supabase.rpc("get_document_version", { p_version_id: id });
      setLoadingId(null);
      if (error || !data) return void toast.error(message(errorCode(error)));
      onSelect({ id, state: fromBase64(data) });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `message` is stable in practice
    [supabase, onSelect],
  );

  return (
    <aside className="no-print flex h-full w-full flex-col border-l border-border bg-surface sm:w-80" aria-label={t("title")}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <History className="size-4" aria-hidden />
          {t("title")}
        </h2>
        <button type="button" onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-surface-hover" aria-label={t("close")}>
          <X className="size-4" />
        </button>
      </div>

      <form
        className="space-y-2 border-b border-border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            await onSaveCurrent(label);
            setLabel("");
            setVersion((v) => v + 1);
            toast.success(t("saved"));
          });
        }}
      >
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder={t("namePlaceholder")}
          aria-label={t("namePlaceholder")}
          maxLength={100}
          className="h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-sm focus:border-primary focus:outline-none"
        />
        <Button type="submit" size="sm" variant="secondary" className="w-full" disabled={pending}>
          {t("saveCurrent")}
        </Button>
      </form>

      <ul className="flex-1 overflow-y-auto p-2">
        <li>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className={cn(
              "w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-hover",
              selectedId === null && "bg-primary-soft font-medium text-primary",
            )}
          >
            {t("current")}
          </button>
        </li>
        {versions === null ? (
          <li className="flex justify-center py-6 text-muted">
            <Spinner />
          </li>
        ) : versions.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-muted">{t("empty")}</li>
        ) : (
          versions.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => void select(v.id)}
                className={cn(
                  "w-full rounded-lg px-3 py-2 text-left hover:bg-surface-hover",
                  selectedId === v.id && "bg-primary-soft",
                )}
              >
                <span className="flex items-center justify-between gap-2 text-sm font-medium">
                  {v.label ?? format.dateTime(new Date(v.createdAt), { dateStyle: "medium", timeStyle: "short" })}
                  {loadingId === v.id ? <Spinner /> : null}
                </span>
                <span className="block text-xs text-muted">
                  {v.label ? `${format.dateTime(new Date(v.createdAt), { dateStyle: "medium", timeStyle: "short" })} · ` : ""}
                  {v.authorName ?? ""}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>

      {selectedId ? (
        <div className="border-t border-border p-3">
          <Button
            className="w-full"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await onRestore();
                setVersion((v) => v + 1);
              })
            }
          >
            {t("restore")}
          </Button>
        </div>
      ) : null}
    </aside>
  );
}
