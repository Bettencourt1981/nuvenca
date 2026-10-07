"use client";

/**
 * Offline copies live in this browser: the editors' documents (IndexedDB,
 * one database per person and file) and the service worker's page cache.
 */
const DOC_PREFIX = "nuvenca-doc:";

/** Delete offline copies — all of them, or all but this person's documents. */
export async function clearOfflineData(options: { keepUserId?: string } = {}) {
  try {
    const databases = (await indexedDB.databases?.()) ?? [];
    for (const { name } of databases) {
      if (!name?.startsWith(DOC_PREFIX)) continue;
      if (options.keepUserId && name.startsWith(`${DOC_PREFIX}${options.keepUserId}:`)) continue;
      indexedDB.deleteDatabase(name);
    }
  } catch {
    // Private mode or an old browser: nothing stored.
  }
  try {
    if (typeof caches !== "undefined") {
      for (const key of await caches.keys()) if (key.startsWith("nuvenca-pages")) await caches.delete(key);
    }
  } catch {
    // Same.
  }
}

/** Register the service worker and keep offline data to the signed-in person. */
export async function setUpOffline(userId: string) {
  const KEY = "nuvenca:offline-user";
  try {
    const previous = localStorage.getItem(KEY);
    if (previous && previous !== userId) await clearOfflineData({ keepUserId: userId });
    localStorage.setItem(KEY, userId);
  } catch {
    // Storage unavailable.
  }
  if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    const ready = await navigator.serviceWorker.ready;
    // Cache the app code this page already loaded.
    const urls = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((url) => url.startsWith(location.origin) && new URL(url).pathname.startsWith("/_next/static/"));
    ready.active?.postMessage({ type: "cache-assets", urls });
  } catch (error) {
    console.warn("Offline support unavailable", error);
  }
}
