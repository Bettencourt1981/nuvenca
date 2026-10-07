"use client";

import { supabasePublishableKey } from "@/lib/env";

/** PUT a file to a signed Storage upload URL, reporting progress (0–1). */
export function putToSignedUrl(
  url: string,
  file: Blob,
  options: { onProgress?: (fraction: number) => void; onStart?: (xhr: XMLHttpRequest) => void } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    options.onStart?.(xhr);
    xhr.open("PUT", url);
    xhr.setRequestHeader("apikey", supabasePublishableKey);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) options.onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("upload_failed")));
    xhr.onerror = () => reject(new Error("upload_failed"));
    xhr.onabort = () => reject(new Error("canceled"));
    xhr.send(file);
  });
}
