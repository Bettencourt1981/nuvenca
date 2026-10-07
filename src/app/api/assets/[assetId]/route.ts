import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveShare } from "@/lib/data/public-share";
import { STORAGE_BUCKET } from "@/lib/env";

/**
 * Serves an image embedded in a document. Access follows the document:
 * signed-in users need read access (RLS); `?share=<token>` serves assets of
 * a document reached through a public link.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/assets/[assetId]">) {
  const { assetId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(assetId)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const token = request.nextUrl.searchParams.get("share");
  const admin = createAdminClient();

  let storagePath: string | null = null;
  if (token) {
    const share = await resolveShare(token);
    const { data: asset } = await admin
      .from("document_assets")
      .select("storage_path, status, file_id, files(ancestor_ids, in_trash)")
      .eq("id", assetId)
      .maybeSingle();
    const file = asset?.files;
    const inside = share && file && !file.in_trash && (asset.file_id === share.root.id || file.ancestor_ids.includes(share.root.id));
    if (asset?.status === "ready" && inside) storagePath = asset.storage_path;
  } else {
    const supabase = await createClient();
    const { data: asset } = await supabase
      .from("document_assets")
      .select("storage_path")
      .eq("id", assetId)
      .maybeSingle();
    storagePath = asset?.storage_path ?? null;
  }
  if (!storagePath) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: signed, error } = await admin.storage.from(STORAGE_BUCKET).createSignedUrl(storagePath, 300);
  if (error || !signed) return NextResponse.json({ error: "unavailable" }, { status: 502 });
  const response = NextResponse.redirect(signed.signedUrl);
  response.headers.set("Cache-Control", "private, max-age=240");
  return response;
}
