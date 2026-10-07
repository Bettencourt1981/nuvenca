import { type NextRequest, NextResponse } from "next/server";
import { createTranslator } from "next-intl";
import en from "@/messages/en.json";
import pt from "@/messages/pt.json";
import { listActivity, type ActivityCategory, type ActivityEvent } from "@/lib/data/activity";
import { activityMessage } from "@/lib/activity-text";
import { getPlans } from "@/lib/data/drive";

const MAX_ROWS = 10_000;
const CATEGORIES = new Set(["all", "files", "downloads", "sharing", "team"]);

/** Spreadsheet-safe CSV cell (quotes, and no formula injection). */
function cell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Export a workspace's activity as CSV (owners and admins; RLS decides). */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/workspaces/[workspaceId]/activity">) {
  const { workspaceId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const params = request.nextUrl.searchParams;
  const category = (CATEGORIES.has(params.get("category") ?? "") ? params.get("category") : "all") as ActivityCategory;
  const query = params.get("q") ?? "";

  // The interface language: the chosen one (cookie), else the browser's.
  const chosen = request.cookies.get("NEXT_LOCALE")?.value;
  const browser = (request.headers.get("accept-language") ?? "").toLowerCase().split(",")[0]?.trim() ?? "";
  const locale = chosen === "en" || chosen === "pt" ? chosen : browser.startsWith("en") ? "en" : "pt";
  const t = createTranslator({ locale, messages: locale === "en" ? en : pt, namespace: "activity" });
  const plans = await getPlans();
  const words = {
    someone: t("someone"),
    system: t("system"),
    topLevel: t("topLevel"),
    shareRole: (role: string) => (t.has(`shareRoles.${role}` as "shareRoles.viewer") ? t(`shareRoles.${role}` as "shareRoles.viewer") : role),
    memberRole: (role: string) => (t.has(`memberRoles.${role}` as "memberRoles.owner") ? t(`memberRoles.${role}` as "memberRoles.owner") : role),
    plan: (id: string) => plans.find((p) => p.id === id)?.name ?? id,
  };

  const events: ActivityEvent[] = [];
  let before: number | undefined;
  try {
    while (events.length < MAX_ROWS) {
      const page = await listActivity({ workspaceId, category, query, before, limit: 1000 });
      events.push(...page.events);
      if (!page.hasMore || page.events.length === 0) break;
      before = page.events[page.events.length - 1].id;
    }
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const lines = [[t("csv.date"), t("csv.person"), t("csv.action"), t("csv.item"), t("csv.description")].map(cell).join(",")];
  for (const event of events) {
    const { key, values } = activityMessage(event, words);
    const description = t.markup(key as "actions.file_created", { ...values, t: (chunks) => chunks });
    lines.push([event.createdAt, event.actorName ?? "", event.action, event.targetName ?? "", description].map(cell).join(","));
  }
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="nuvenca-activity-${date}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
