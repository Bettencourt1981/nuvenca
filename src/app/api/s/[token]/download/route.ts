import { after, type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveShare } from "@/lib/data/public-share";
import { STORAGE_BUCKET } from "@/lib/env";
import { nativeType } from "@/lib/editors/native";
import { attachmentHeader, exportNativeFile, loadStateAsAdmin } from "@/lib/data/native";

/** Download (or `?inline=1` preview) a file reached through a public link. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/s/[token]/download">) {
  const { token } = await ctx.params;
  const { searchParams } = request.nextUrl;
  const share = await resolveShare(token, searchParams.get("file"));
  if (!share || share.item.kind !== "file") return NextResponse.json({ error: "not_found" }, { status: 404 });
  const inline = searchParams.get("inline") === "1";
  if (!inline) {
    const fileId = share.item.id;
    after(async () => {
      await createAdminClient().rpc("log_file_download", { p_file_id: fileId });
    });
  }

  const native = nativeType(share.item.mimeType);
  if (native) {
    const state = await loadStateAsAdmin(share.item.id);
    if (!state) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const exported = await exportNativeFile(share.item.id, native, state);
    return new NextResponse(Buffer.from(exported.data), {
      headers: {
        "Content-Type": exported.contentType,
        "Content-Disposition": attachmentHeader(share.item.name, exported.extension),
        "Cache-Control": "private, no-store",
      },
    });
  }
  if (!share.item.currentVersionId) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const admin = createAdminClient();
  const { data: version } = await admin
    .from("file_versions")
    .select("storage_path")
    .eq("id", share.item.currentVersionId)
    .single();
  if (!version) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: signed, error } = await admin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(version.storage_path, 60, { download: inline ? false : share.item.name });
  if (error || !signed) return NextResponse.json({ error: "unavailable" }, { status: 502 });

  const response = NextResponse.redirect(signed.signedUrl);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
