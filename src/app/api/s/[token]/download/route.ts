import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveShare } from "@/lib/data/public-share";
import { STORAGE_BUCKET } from "@/lib/env";

/** Download (or `?inline=1` preview) a file reached through a public link. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/s/[token]/download">) {
  const { token } = await ctx.params;
  const { searchParams } = request.nextUrl;
  const share = await resolveShare(token, searchParams.get("file"));
  if (!share || share.item.kind !== "file" || !share.item.currentVersionId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: version } = await admin
    .from("file_versions")
    .select("storage_path")
    .eq("id", share.item.currentVersionId)
    .single();
  if (!version) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const inline = searchParams.get("inline") === "1";
  const { data: signed, error } = await admin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(version.storage_path, 60, { download: inline ? false : share.item.name });
  if (error || !signed) return NextResponse.json({ error: "unavailable" }, { status: 502 });

  const response = NextResponse.redirect(signed.signedUrl);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
