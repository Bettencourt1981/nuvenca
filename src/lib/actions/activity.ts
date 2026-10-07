"use server";

import { z } from "zod";
import { errorCode, fail, ok, type ActionResult } from "@/lib/errors";
import { listActivity, type ActivityEvent } from "@/lib/data/activity";

const input = z.object({
  workspaceId: z.string().uuid(),
  category: z.enum(["all", "files", "downloads", "sharing", "team"]).default("all"),
  query: z.string().max(100).default(""),
  before: z.number().int().positive().optional(),
});

/** The next page of activity ("Load more", or a new filter). */
export async function loadActivity(raw: z.input<typeof input>): Promise<ActionResult<{ events: ActivityEvent[]; hasMore: boolean }>> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return fail("generic");
  try {
    return ok(await listActivity(parsed.data));
  } catch (error) {
    return fail(errorCode(error));
  }
}
