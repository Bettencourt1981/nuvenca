import type { ActivityEvent } from "@/lib/data/activity";
import { itemHref } from "@/lib/links";

/** Translated words an activity sentence may need. */
export type ActivityWords = {
  someone: string;
  system: string;
  topLevel: string;
  shareRole: (role: string) => string;
  memberRole: (role: string) => string;
  plan: (id: string) => string;
};

const KNOWN = new Set([
  "file.created",
  "file.uploaded",
  "file.renamed",
  "file.moved",
  "file.trashed",
  "file.restored",
  "file.deleted",
  "file.downloaded",
  "share.added",
  "share.changed",
  "share.removed",
  "link.changed",
  "member.added",
  "member.role_changed",
  "member.removed",
  "workspace.renamed",
  "plan.changed",
]);

const text = (value: unknown) => (typeof value === "string" ? value : value === null || value === undefined ? "" : String(value));

/**
 * The message key (under `activity.`) and values describing an event. Callers
 * render it with `t.rich` (UI, `<t>` = link to the item) or `t.markup` (CSV).
 */
export function activityMessage(event: Pick<ActivityEvent, "action" | "actorName" | "targetName" | "details">, words: ActivityWords) {
  const d = event.details;
  const action = KNOWN.has(event.action) ? event.action : null;
  const automatic = d.automatic === true;
  const actor = event.actorName ?? (event.action === "plan.changed" || automatic ? words.system : words.someone);
  const isShare = event.action.startsWith("share.") || event.action.startsWith("link.");
  const role = text(d.role);
  const values: Record<string, string> = {
    actor,
    target: event.targetName ?? "",
    kind: d.kind === "folder" ? "folder" : "file",
    email: text(d.email),
    role: role ? (isShare ? words.shareRole(role) : words.memberRole(role)) : "",
    automatic: String(automatic),
    enabled: String(d.enabled === true),
    via: d.via === "link" ? "link" : "user",
    action: event.action,
    from: event.action === "plan.changed" ? words.plan(text(d.from)) : text(d.from),
    to: event.action === "plan.changed" ? words.plan(text(d.to)) : d.to === null || d.to === undefined ? words.topLevel : text(d.to),
  };
  return { key: `actions.${action ? action.replace(".", "_") : "unknown"}`, values };
}

/** Where the event's item can be opened, if it still may exist. */
export function activityTargetHref(event: Pick<ActivityEvent, "action" | "targetId" | "details">): string | null {
  if (!event.targetId || event.action === "file.deleted") return null;
  if (!/^(file|share|link)\./.test(event.action)) return null;
  const kind = event.details.kind === "folder" ? "folder" : "file";
  return itemHref({ id: event.targetId, kind, mimeType: typeof event.details.mime === "string" ? event.details.mime : null });
}
