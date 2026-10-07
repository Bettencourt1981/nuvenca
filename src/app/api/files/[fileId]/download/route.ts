import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { STORAGE_BUCKET } from "@/lib/env";

/**
 * Redirects to a short-lived signed URL for the file's current version.
 * `?inline=1` serves it for previews instead of as an attachment.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/files/[fileId]/download">) {
  const { fileId } = await ctx.params;
  const inline = request.nextUrl.searchParams.get("inline") === "1";

  // RLS decides whether the signed-in user may read this file.
  const supabase = await createClient();
  const { data: file } = await supabase
    .from("files")
    .select("name, kind, status, current_version_id")
    .eq("id", fileId)
    .maybeSingle();
  if (!file || file.kind !== "file" || file.status !== "ready" || !file.current_version_id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: version } = await admin
    .from("file_versions")
    .select("storage_path")
    .eq("id", file.current_version_id)
    .single();
  if (!version) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: signed, error } = await admin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(version.storage_path, 60, { download: inline ? false : file.name });
  if (error || !signed) return NextResponse.json({ error: "unavailable" }, { status: 502 });

  const response = NextResponse.redirect(signed.signedUrl);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
