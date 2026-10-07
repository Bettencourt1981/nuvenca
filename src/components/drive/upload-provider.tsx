"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, ChevronDown, ChevronUp, CircleAlert, X } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { cancelUpload, finishUpload, startUpload } from "@/lib/actions/drive";
import { supabasePublishableKey } from "@/lib/env";
import { useErrorMessage } from "@/hooks/use-error-message";
import { FileIcon } from "./file-icon";

type UploadStatus = "queued" | "uploading" | "done" | "failed" | "canceled";

type UploadTask = {
  id: string;
  file: File;
  workspaceId: string | null;
  parentId: string | null;
  status: UploadStatus;
  progress: number;
  error?: string;
  fileId?: string;
  xhr?: XMLHttpRequest;
};

export type UploadTarget = { workspaceId: string | null; parentId: string | null };

type UploadContextValue = { upload: (files: File[], target: UploadTarget) => void };

const UploadContext = createContext<UploadContextValue | null>(null);
const CONCURRENCY = 3;

export function useUploads() {
  const value = useContext(UploadContext);
  if (!value) throw new Error("useUploads must be used inside <UploadProvider>");
  return value;
}

/** PUT the bytes to the signed Storage URL, reporting progress. */
function putFile(task: UploadTask, url: string, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    task.xhr = xhr;
    xhr.open("PUT", url);
    xhr.setRequestHeader("apikey", supabasePublishableKey);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.setRequestHeader("content-type", task.file.type || "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("upload_failed")));
    xhr.onerror = () => reject(new Error("upload_failed"));
    xhr.onabort = () => reject(new Error("canceled"));
    xhr.send(task.file);
  });
}

export function UploadProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const tasksRef = useRef<UploadTask[]>([]);
  const router = useRouter();

  const update = useCallback((id: string, patch: Partial<UploadTask>) => {
    tasksRef.current = tasksRef.current.map((t) => (t.id === id ? { ...t, ...patch } : t));
    setTasks(tasksRef.current);
  }, []);

  const run = useCallback(
    async (task: UploadTask) => {
      update(task.id, { status: "uploading", progress: 0 });
      const started = await startUpload({
        workspaceId: task.workspaceId,
        parentId: task.parentId,
        name: task.file.name,
        size: task.file.size,
        type: task.file.type,
      });
      if (!started.ok) {
        update(task.id, { status: "failed", error: started.error });
        return;
      }
      const { fileId, versionId, uploadUrl } = started.data;
      update(task.id, { fileId });
      try {
        const current = tasksRef.current.find((t) => t.id === task.id)!;
        if (current.status === "canceled") throw new Error("canceled");
        await putFile(current, uploadUrl, (fraction) => update(task.id, { progress: fraction }));
      } catch (error) {
        const canceled = (error as Error).message === "canceled";
        update(task.id, { status: canceled ? "canceled" : "failed", error: canceled ? undefined : "upload_failed" });
        void cancelUpload({ fileId });
        return;
      }
      const finished = await finishUpload({ fileId, versionId });
      if (finished.ok) update(task.id, { status: "done", progress: 1 });
      else update(task.id, { status: "failed", error: finished.error });
    },
    [update],
  );

  // Simple scheduler: keep up to CONCURRENCY uploads running.
  useEffect(() => {
    const running = tasks.filter((t) => t.status === "uploading").length;
    const queued = tasks.filter((t) => t.status === "queued");
    queued.slice(0, Math.max(0, CONCURRENCY - running)).forEach((task) => {
      update(task.id, { status: "uploading" });
      void run(task);
    });
  }, [tasks, run, update]);

  // Refresh the file list once a batch finishes.
  const active = tasks.some((t) => t.status === "queued" || t.status === "uploading");
  const completed = tasks.filter((t) => t.status === "done").length;
  const lastRefresh = useRef(0);
  useEffect(() => {
    if (!active && completed > lastRefresh.current) {
      lastRefresh.current = completed;
      router.refresh();
    }
  }, [active, completed, router]);

  const upload = useCallback((files: File[], target: UploadTarget) => {
    const added = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      workspaceId: target.workspaceId,
      parentId: target.parentId,
      status: "queued" as const,
      progress: 0,
    }));
    tasksRef.current = [...tasksRef.current, ...added];
    setTasks(tasksRef.current);
  }, []);

  const cancel = useCallback(
    (id: string) => {
      const task = tasksRef.current.find((t) => t.id === id);
      if (!task) return;
      if (task.xhr) task.xhr.abort();
      update(id, { status: "canceled" });
    },
    [update],
  );

  const dismiss = useCallback(() => {
    tasksRef.current = tasksRef.current.filter((t) => t.status === "queued" || t.status === "uploading");
    lastRefresh.current = 0;
    setTasks(tasksRef.current);
  }, []);

  const value = useMemo(() => ({ upload }), [upload]);

  return (
    <UploadContext value={value}>
      {children}
      {tasks.length > 0 ? <UploadPanel tasks={tasks} onCancel={cancel} onDismiss={dismiss} /> : null}
    </UploadContext>
  );
}

function UploadPanel({
  tasks,
  onCancel,
  onDismiss,
}: {
  tasks: UploadTask[];
  onCancel: (id: string) => void;
  onDismiss: () => void;
}) {
  const t = useTranslations("upload");
  const message = useErrorMessage();
  const [collapsed, setCollapsed] = useState(false);
  const pending = tasks.filter((task) => task.status === "queued" || task.status === "uploading").length;
  const done = tasks.filter((task) => task.status === "done").length;

  return (
    <section
      aria-live="polite"
      className="fixed bottom-4 right-4 z-30 w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-2xl border border-border bg-surface shadow-xl"
    >
      <header className="flex items-center justify-between gap-2 bg-surface-muted px-4 py-3">
        <h2 className="text-sm font-semibold">
          {pending > 0 ? t("title", { count: pending }) : t("doneTitle", { count: done })}
        </h2>
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className="rounded-lg p-1.5 text-muted hover:bg-surface-hover"
            aria-expanded={!collapsed}
          >
            {collapsed ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
          {pending === 0 ? (
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-lg p-1.5 text-muted hover:bg-surface-hover"
              aria-label={t("dismiss")}
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
      </header>
      {collapsed ? null : (
        <ul className="max-h-72 divide-y divide-border overflow-y-auto">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center gap-3 px-4 py-2.5">
              <FileIcon kind="file" name={task.file.name} mimeType={task.file.type} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{task.file.name}</p>
                {task.status === "uploading" ? (
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-hover">
                    <div
                      className="h-full rounded-full bg-primary transition-[width]"
                      style={{ width: `${Math.round(task.progress * 100)}%` }}
                    />
                  </div>
                ) : (
                  <p className={task.status === "failed" ? "text-xs text-danger" : "text-xs text-muted"}>
                    {task.status === "failed"
                      ? message(task.error)
                      : task.status === "queued"
                        ? t("queued")
                        : task.status === "canceled"
                          ? t("canceled")
                          : t("completed")}
                  </p>
                )}
              </div>
              {task.status === "done" ? (
                <CheckCircle2 className="size-5 shrink-0 text-success" aria-label={t("completed")} />
              ) : task.status === "failed" ? (
                <CircleAlert className="size-5 shrink-0 text-danger" aria-label={t("failed")} />
              ) : task.status === "queued" || task.status === "uploading" ? (
                <button
                  type="button"
                  onClick={() => onCancel(task.id)}
                  className="rounded-lg p-1 text-muted hover:bg-surface-hover"
                  aria-label={t("cancel")}
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
