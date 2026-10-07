"use client";

import { finishAssetUpload, startAssetUpload } from "@/lib/actions/documents";
import { putToSignedUrl } from "@/lib/upload";

const MAX_DIMENSION = 2000;

/** Downscale very large photos before upload (keeps documents light). */
async function shrink(file: Blob): Promise<Blob> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size < 1_500_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 5_000_000) return file;
    const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await canvas.convertToBlob({ type: "image/jpeg", quality: 0.88 });
  } catch {
    return file;
  }
}

/** Upload an image for a document and return the URL to embed. */
export async function uploadDocumentImage(fileId: string, original: Blob): Promise<string> {
  const file = await shrink(original);
  const started = await startAssetUpload({ fileId, size: file.size, type: file.type });
  if (!started.ok) throw new Error(started.error);
  await putToSignedUrl(started.data.uploadUrl, file);
  const finished = await finishAssetUpload({ assetId: started.data.assetId });
  if (!finished.ok) throw new Error(finished.error);
  return started.data.src;
}
