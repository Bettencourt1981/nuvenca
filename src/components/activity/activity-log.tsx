"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowRightLeft,
  Download,
  FilePlus2,
  History,
  Link2,
  Pencil,
  RotateCcw,
  Search,
  Share2,
  Trash2,
  Upload,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { loadActivity } from "@/lib/actions/activity";
import { activityMessage, activityTargetHref, type ActivityWords } from "@/lib/activity-text";
import type { ActivityCategory, ActivityEvent } from "@/lib/data/activity";
import { useErrorMessage } from "@/hooks/use-error-message";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

const ICONS: Record<string, LucideIcon> = {
  "file.created": FilePlus2,
  "file.uploaded": Upload,
  "file.renamed": Pencil,
  "file.moved": ArrowRightLeft,
  "file.trashed": Trash2,
  "file.restored": RotateCcw,
  "file.deleted": Trash2,
  "file.downloaded": Download,
  "share.added": Share2,
  "share.changed": Share2,
  "share.removed": Share2,
  "link.changed": Link2,
};

const CATEGORIES: ActivityCategory[] = ["all", "files", "downloads", "sharing", "team"];

export function ActivityLog({
  workspaceId,
  initial,
  planNames,
}: {
  workspaceId: string;
  initial: { events: ActivityEvent[]; hasMore: boolean };
  planNames: Record<string, string>;
}) {
  const t = useTranslations("activity");
  const format = useFormatter();
  const message = useErrorMessage();
  const [events, setEvents] = useState(initial.events);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [category, setCategory] = useState<ActivityCategory>("all");
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const firstRender = useRef(true);

  const words: ActivityWords = {
    someone: t("someone"),
    system: t("system"),
    topLevel: t("topLevel"),
    shareRole: (role) => (t.has(`shareRoles.${role}` as "shareRoles.viewer") ? t(`shareRoles.${role}` as "shareRoles.viewer") : role),
    memberRole: (role) => (t.has(`memberRoles.${role}` as "memberRoles.owner") ? t(`memberRoles.${role}` as "memberRoles.owner") : role),
    plan: (id) => planNames[id] ?? id,
  };

  const load = (options: { append: boolean; category: ActivityCategory; query: string }) =>
    startTransition(async () => {
      const before = options.append ? events[events.length - 1]?.id : undefined;
      const result = await loadActivity({ workspaceId, category: options.category, query: options.query, before });
      if (!result.ok) return void toast.error(message(result.error));
      setEvents((current) => (options.append ? [...current, ...result.data.events] : result.data.events));
      setHasMore(result.data.hasMore);
    });

  // Re-run the search shortly after the person stops typing.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = setTimeout(() => load({ append: false, category, query }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load is recreated each render
  }, [category, query]);

  const exportHref = `/api/workspaces/${workspaceId}/activity?${new URLSearchParams({ category, q: query })}`;
  const filtered = category !== "all" || query.trim() !== "";

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("search")}
            aria-label={t("search")}
            className="pl-9"
          />
        </div>
        <Select
          value={category}
          onChange={(event) => setCategory(event.target.value as ActivityCategory)}
          aria-label={t("filterLabel")}
          className="sm:w-48"
        >
          {CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {t(`filters.${value}`)}
            </option>
          ))}
        </Select>
        <a href={exportHref} className={buttonClasses({ variant: "secondary" })} download>
          <Download className="size-4" />
          {t("export")}
        </a>
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-muted">
          {pending ? <Spinner className="size-6" /> : <History className="size-10" aria-hidden />}
          {pending ? null : <p>{filtered ? t("emptyFiltered") : t("empty")}</p>}
        </div>
      ) : (
        <ol className="divide-y divide-border rounded-xl border border-border bg-surface" aria-busy={pending}>
          {events.map((event) => {
            const Icon = ICONS[event.action] ?? UsersRound;
            const { key, values } = activityMessage(event, words);
            const href = activityTargetHref(event);
            return (
              <li key={event.id} className="flex items-start gap-3 px-4 py-3" data-action={event.action}>
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-muted text-muted">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-6">
                    {t.rich(key as "actions.file_created", {
                      ...values,
                      t: (chunks) =>
                        href ? (
                          <Link href={href} className="font-medium hover:underline">
                            {chunks}
                          </Link>
                        ) : (
                          <span className="font-medium">{chunks}</span>
                        ),
                    })}
                  </p>
                  <time dateTime={event.createdAt} className="text-xs text-muted" title={format.dateTime(new Date(event.createdAt), { dateStyle: "full", timeStyle: "medium" })}>
                    {format.dateTime(new Date(event.createdAt), { dateStyle: "medium", timeStyle: "short" })}
                  </time>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {hasMore ? (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" disabled={pending} onClick={() => load({ append: true, category, query })}>
            {pending ? <Spinner className="size-4" /> : null}
            {t("loadMore")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
