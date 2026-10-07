"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Bell, CheckCheck, MessageSquare, Share2, UsersRound } from "lucide-react";
import { Popover } from "radix-ui";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { itemHref } from "@/lib/links";
import { cn } from "@/lib/utils";

type Notification = {
  id: number;
  kind: "file_shared" | "workspace_member" | "comment";
  actor_name: string | null;
  file_id: string | null;
  workspace_id: string | null;
  subject: string;
  data: { role?: string; kind?: "file" | "folder"; mime?: string | null; excerpt?: string; reply?: boolean };
  read_at: string | null;
  created_at: string;
};

const COLUMNS = "id, kind, actor_name, file_id, workspace_id, subject, data, read_at, created_at";
const PAGE = 30;

function hrefFor(n: Notification): string | null {
  if (n.kind === "workspace_member") return n.workspace_id ? `/workspaces/${n.workspace_id}` : null;
  if (!n.file_id) return null;
  return itemHref({ id: n.file_id, kind: n.data.kind === "folder" ? "folder" : "file", mimeType: n.data.mime ?? null });
}

/** The bell: what was shared with me, teams I joined, comments on my files. Live via Realtime. */
export function NotificationBell({ userId }: { userId: string }) {
  const t = useTranslations("notifications");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const describe = useCallback(
    (n: Notification) => {
      const actor = n.actor_name ?? t("someone");
      if (n.kind === "file_shared") return t("shared", { actor, subject: n.subject, kind: n.data.kind === "folder" ? "folder" : "file" });
      if (n.kind === "workspace_member") return t("team", { actor, subject: n.subject });
      return t(n.data.reply ? "reply" : "comment", { actor, subject: n.subject });
    },
    [t],
  );
  // The live subscription reads the latest describer without resubscribing.
  const describeRef = useRef(describe);
  useEffect(() => {
    describeRef.current = describe;
  }, [describe]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("notifications")
      .select(COLUMNS)
      .order("id", { ascending: false })
      .limit(PAGE)
      .then(({ data }) => {
        if (!cancelled && data) setItems(data as Notification[]);
      });
    // Private channel: Realtime checks the user's token before letting them join.
    const channel = supabase
      .channel(`notifications:${userId}`, { config: { private: true } })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          const n = payload.new as Notification;
          setItems((current) => (current.some((c) => c.id === n.id) ? current : [n, ...current].slice(0, PAGE)));
          toast(describeRef.current(n));
        },
      );
    void supabase.realtime.setAuth().then(() => {
      if (!cancelled) channel.subscribe();
    });
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [supabase, userId]);

  const unread = items.filter((n) => !n.read_at).length;

  const markRead = async (ids: number[] | null) => {
    const stamp = new Date().toISOString();
    setItems((current) => current.map((n) => (ids === null || ids.includes(n.id) ? { ...n, read_at: n.read_at ?? stamp } : n)));
    await supabase.rpc("mark_notifications_read", { p_ids: ids ?? undefined });
  };

  const openItem = (n: Notification) => {
    if (!n.read_at) void markRead([n.id]);
    setOpen(false);
    const href = hrefFor(n);
    if (href) router.push(href);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        className="relative ml-auto flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-hover"
        aria-label={unread ? t("labelUnread", { count: unread }) : t("label")}
      >
        <Bell className="size-5" />
        {unread ? (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-none text-white"
            data-testid="notification-count"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-[min(24rem,calc(100vw-1rem))] overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">{t("title")}</h2>
            {unread ? (
              <button
                type="button"
                onClick={() => void markRead(null)}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-primary hover:bg-primary-soft"
              >
                <CheckCheck className="size-3.5" />
                {t("markAll")}
              </button>
            ) : null}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted">{t("empty")}</p>
          ) : (
            <ul className="max-h-[min(28rem,70vh)] overflow-y-auto py-1">
              {items.map((n) => {
                const Icon = n.kind === "comment" ? MessageSquare : n.kind === "workspace_member" ? UsersRound : Share2;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openItem(n)}
                      className={cn("flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-surface-hover", !n.read_at && "bg-primary-soft/40")}
                    >
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-muted text-muted">
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm leading-5">{describe(n)}</span>
                        {n.data.excerpt ? <span className="mt-0.5 line-clamp-2 block text-xs text-muted">“{n.data.excerpt}”</span> : null}
                        <span className="mt-0.5 block text-xs text-muted">{format.relativeTime(new Date(n.created_at), now)}</span>
                      </span>
                      {!n.read_at ? <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-label={t("unread")} /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
