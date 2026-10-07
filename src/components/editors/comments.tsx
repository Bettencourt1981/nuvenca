"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, MoreVertical, RotateCcw, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/database.types";
import { useErrorMessage } from "@/hooks/use-error-message";
import { errorCode } from "@/lib/errors";
import { colorFor } from "@/lib/collab/colors";
import { Button } from "@/components/ui/button";
import { DropdownContent, DropdownItem, DropdownMenu, DropdownTrigger } from "@/components/ui/dropdown";
import { cn, initials } from "@/lib/utils";

export type CommentEntry = {
  id: string;
  body: string;
  createdBy: string | null;
  authorName: string;
  createdAt: string;
};

export type CommentThread<A = unknown> = CommentEntry & {
  anchor: A | null;
  quote: string | null;
  resolved: boolean;
  replies: CommentEntry[];
};

type Row = {
  id: string;
  parent_id: string | null;
  anchor: Json | null;
  quote: string | null;
  body: string;
  created_by: string | null;
  created_at: string;
  resolved_at: string | null;
};

/** Comment threads for a file, kept live with Realtime database changes. */
export function useComments<A = unknown>(fileId: string, enabled: boolean) {
  const [supabase] = useState(() => createClient());
  const [rows, setRows] = useState<Row[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const namesRef = useRef(names);
  useEffect(() => {
    namesRef.current = names;
  }, [names]);

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from("document_comments")
      .select("id, parent_id, anchor, quote, body, created_by, created_at, resolved_at")
      .eq("file_id", fileId)
      .order("created_at");
    const list = (data ?? []) as Row[];
    setRows(list);
    const missing = [...new Set(list.map((r) => r.created_by).filter((id): id is string => !!id && !namesRef.current[id]))];
    if (missing.length) {
      const { data: profiles } = await supabase.rpc("get_profiles", { p_user_ids: missing });
      if (profiles) {
        setNames((current) => ({
          ...current,
          ...Object.fromEntries(profiles.map((p) => [p.id, p.full_name || p.email])),
        }));
      }
    }
  }, [supabase, fileId]);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 150);
    };
    schedule();
    const channel = supabase
      .channel(`comments:${fileId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "document_comments", filter: `file_id=eq.${fileId}` },
        schedule,
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [supabase, fileId, enabled, refresh]);

  const threads = useMemo<CommentThread<A>[]>(() => {
    const entry = (row: Row): CommentEntry => ({
      id: row.id,
      body: row.body,
      createdBy: row.created_by,
      authorName: (row.created_by && names[row.created_by]) || "…",
      createdAt: row.created_at,
    });
    const roots = rows.filter((row) => !row.parent_id);
    return roots.map((root) => ({
      ...entry(root),
      anchor: root.anchor as A | null,
      quote: root.quote,
      resolved: Boolean(root.resolved_at),
      replies: rows.filter((row) => row.parent_id === root.id).map(entry),
    }));
  }, [rows, names]);

  const call = useCallback(
    async (fn: string, args: Record<string, unknown>) => {
      const { data, error } = await supabase.rpc(fn as never, args as never);
      if (error) throw new Error(errorCode(error));
      void refresh();
      return data as unknown;
    },
    [supabase, refresh],
  );

  return {
    threads,
    refresh,
    add: (anchor: A, quote: string | null, body: string) =>
      call("add_comment", { p_file_id: fileId, p_parent_id: null, p_anchor: anchor, p_quote: quote, p_body: body }) as Promise<{
        id: string;
      }>,
    reply: (threadId: string, body: string) =>
      call("add_comment", { p_file_id: fileId, p_parent_id: threadId, p_anchor: null, p_quote: null, p_body: body }),
    edit: (id: string, body: string) => call("edit_comment", { p_comment_id: id, p_body: body }),
    remove: (id: string) => call("delete_comment", { p_comment_id: id }),
    resolve: (id: string, resolved: boolean) => call("resolve_comment", { p_comment_id: id, p_resolved: resolved }),
  };
}

export type CommentsApi<A> = ReturnType<typeof useComments<A>>;

export function CommentsPanel<A>({
  api,
  currentUserId,
  canComment,
  canModerate,
  activeId,
  onActivate,
  draft,
  onDraftDone,
  onClose,
}: {
  api: CommentsApi<A>;
  currentUserId: string;
  canComment: boolean;
  canModerate: boolean;
  activeId: string | null;
  onActivate: (id: string) => void;
  /** A new thread being written for the current selection. */
  draft: { anchor: A; quote: string | null } | null;
  onDraftDone: (threadId: string | null) => void;
  onClose: () => void;
}) {
  const t = useTranslations("editor.comments");
  const [showResolved, setShowResolved] = useState(false);
  const visible = api.threads.filter((thread) => showResolved || !thread.resolved);

  return (
    <aside className="no-print flex h-full w-full flex-col border-l border-border bg-surface sm:w-80" aria-label={t("title")}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="font-semibold">{t("title")}</h2>
        <div className="flex items-center gap-1">
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input
              type="checkbox"
              checked={showResolved}
              onChange={(event) => setShowResolved(event.target.checked)}
              className="accent-primary"
            />
            {t("showResolved")}
          </label>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-surface-hover" aria-label={t("close")}>
            <X className="size-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {draft ? (
          <div className="rounded-xl border border-primary bg-surface p-3 shadow-sm">
            {draft.quote ? <Quote text={draft.quote} /> : null}
            <Composer
              autoFocus
              placeholder={t("placeholder")}
              submitLabel={t("comment")}
              onCancel={() => onDraftDone(null)}
              onSubmit={async (body) => {
                const created = await api.add(draft.anchor, draft.quote, body);
                onDraftDone(created?.id ?? null);
              }}
            />
          </div>
        ) : null}
        {visible.length === 0 && !draft ? (
          <p className="px-2 py-8 text-center text-sm text-muted">{canComment ? t("emptyHint") : t("empty")}</p>
        ) : null}
        {visible.map((thread) => (
          <ThreadCard
            key={thread.id}
            thread={thread}
            api={api}
            active={thread.id === activeId}
            onActivate={() => onActivate(thread.id)}
            currentUserId={currentUserId}
            canComment={canComment}
            canModerate={canModerate}
          />
        ))}
      </div>
    </aside>
  );
}

function Quote({ text }: { text: string }) {
  return <p className="mb-2 line-clamp-2 border-l-2 border-amber-400 pl-2 text-xs italic text-muted">{text}</p>;
}

function Composer({
  placeholder,
  submitLabel,
  initialValue = "",
  autoFocus,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  submitLabel: string;
  initialValue?: string;
  autoFocus?: boolean;
  onSubmit: (body: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const common = useTranslations("common");
  const message = useErrorMessage();
  const [value, setValue] = useState(initialValue);
  const [pending, startTransition] = useTransition();
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const body = value.trim();
        if (!body) return;
        startTransition(async () => {
          try {
            await onSubmit(body);
            setValue("");
          } catch (error) {
            toast.error(message((error as Error).message));
          }
        });
      }}
    >
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={autoFocus}
        rows={2}
        maxLength={5000}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) event.currentTarget.form?.requestSubmit();
          if (event.key === "Escape") onCancel?.();
        }}
        className="w-full resize-none rounded-lg border border-border bg-surface px-2.5 py-2 text-sm focus:border-primary focus:outline-none"
      />
      {value.trim() || onCancel ? (
        <div className="mt-2 flex justify-end gap-2">
          {onCancel ? (
            <Button size="sm" variant="ghost" onClick={onCancel}>
              {common("cancel")}
            </Button>
          ) : null}
          <Button size="sm" type="submit" disabled={pending || !value.trim()}>
            {submitLabel}
          </Button>
        </div>
      ) : null}
    </form>
  );
}

function ThreadCard<A>({
  thread,
  api,
  active,
  onActivate,
  currentUserId,
  canComment,
  canModerate,
}: {
  thread: CommentThread<A>;
  api: CommentsApi<A>;
  active: boolean;
  onActivate: () => void;
  currentUserId: string;
  canComment: boolean;
  canModerate: boolean;
}) {
  const t = useTranslations("editor.comments");
  const message = useErrorMessage();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active]);

  const run = (action: () => Promise<unknown>) => void action().catch((error) => toast.error(message((error as Error).message)));

  return (
    <div
      ref={ref}
      onClick={onActivate}
      className={cn(
        "cursor-pointer rounded-xl border bg-surface p-3 text-sm transition-shadow",
        active ? "border-primary shadow-md" : "border-border hover:shadow-sm",
        thread.resolved && "opacity-70",
      )}
    >
      {thread.quote ? <Quote text={thread.quote} /> : null}
      <Entry
        entry={thread}
        currentUserId={currentUserId}
        canModerate={canModerate}
        api={api}
        extra={
          canComment ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                run(() => api.resolve(thread.id, !thread.resolved));
              }}
              className="rounded-lg p-1 text-muted hover:bg-surface-hover hover:text-success"
              aria-label={thread.resolved ? t("reopen") : t("resolve")}
              title={thread.resolved ? t("reopen") : t("resolve")}
            >
              {thread.resolved ? <RotateCcw className="size-4" /> : <Check className="size-4" />}
            </button>
          ) : null
        }
      />
      {thread.replies.map((reply) => (
        <div key={reply.id} className="mt-3 border-t border-border pt-3">
          <Entry entry={reply} currentUserId={currentUserId} canModerate={canModerate} api={api} />
        </div>
      ))}
      {active && canComment ? (
        <div className="mt-3" onClick={(event) => event.stopPropagation()}>
          <Composer placeholder={t("reply")} submitLabel={t("reply")} onSubmit={(body) => api.reply(thread.id, body).then(() => undefined)} />
        </div>
      ) : null}
    </div>
  );
}

function Entry<A>({
  entry,
  currentUserId,
  canModerate,
  api,
  extra,
}: {
  entry: CommentEntry;
  currentUserId: string;
  canModerate: boolean;
  api: CommentsApi<A>;
  extra?: React.ReactNode;
}) {
  const t = useTranslations("editor.comments");
  const format = useFormatter();
  const message = useErrorMessage();
  const [editing, setEditing] = useState(false);
  const mine = entry.createdBy === currentUserId;
  const color = colorFor(entry.createdBy ?? entry.id);

  return (
    <div>
      <div className="flex items-start gap-2">
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
          style={{ backgroundColor: color }}
          aria-hidden
        >
          {initials(entry.authorName)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{entry.authorName}</p>
          <p className="text-xs text-muted">{format.dateTime(new Date(entry.createdAt), { dateStyle: "medium", timeStyle: "short" })}</p>
        </div>
        {extra}
        {mine || canModerate ? (
          <DropdownMenu>
            <DropdownTrigger
              onClick={(event) => event.stopPropagation()}
              className="rounded-lg p-1 text-muted hover:bg-surface-hover"
              aria-label={t("more")}
            >
              <MoreVertical className="size-4" />
            </DropdownTrigger>
            <DropdownContent className="min-w-36">
              {mine ? <DropdownItem onSelect={() => setEditing(true)}>{t("edit")}</DropdownItem> : null}
              <DropdownItem
                danger
                onSelect={() => void api.remove(entry.id).catch((error) => toast.error(message((error as Error).message)))}
              >
                {t("delete")}
              </DropdownItem>
            </DropdownContent>
          </DropdownMenu>
        ) : null}
      </div>
      {editing ? (
        <div className="mt-2" onClick={(event) => event.stopPropagation()}>
          <Composer
            autoFocus
            initialValue={entry.body}
            placeholder={t("edit")}
            submitLabel={t("save")}
            onCancel={() => setEditing(false)}
            onSubmit={async (body) => {
              await api.edit(entry.id, body);
              setEditing(false);
            }}
          />
        </div>
      ) : (
        <p className="mt-1.5 whitespace-pre-wrap break-words">{entry.body}</p>
      )}
    </div>
  );
}
