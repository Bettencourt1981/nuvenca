/*
 * Nuvenca service worker: lets pages you have opened (and their documents,
 * which the editors keep in IndexedDB) open again without a connection.
 *
 * - App code and fonts (/_next/static, immutable): cache first.
 * - Pages: network first; the last good copy is used when offline.
 * - API calls and Supabase are never cached here.
 * Signing out deletes these caches (see src/lib/offline.ts).
 */
const STATIC = "nuvenca-static-v1";
const PAGES = "nuvenca-pages-v1";
const OFFLINE_URL = "/offline.html";
const OFFLINE_PAGES = /^\/(drive|document|spreadsheet|shared|recent|starred|search|settings|workspaces|file|trash)(\/|$)/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC)
      .then((cache) => cache.add(OFFLINE_URL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("nuvenca-") && key !== STATIC && key !== PAGES) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") cache.put(request, response.clone());
  return response;
}

async function networkFirstPage(request) {
  const cache = await caches.open(PAGES);
  try {
    const response = await fetch(request);
    // Only real pages (not sign-in redirects or errors) are kept.
    if (response.ok && response.type === "basic" && !response.redirected) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const hit = (await cache.match(request)) || (await cache.match(request, { ignoreSearch: true }));
    if (hit) return hit;
    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.mode === "navigate" && OFFLINE_PAGES.test(url.pathname)) {
    event.respondWith(networkFirstPage(request));
  }
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "cache-assets" && Array.isArray(data.urls)) {
    // App code the page loaded before this worker controlled it.
    event.waitUntil(
      caches.open(STATIC).then((cache) =>
        Promise.all(
          data.urls
            .filter((u) => typeof u === "string" && new URL(u, self.location.origin).pathname.startsWith("/_next/static/"))
            .map((u) => cache.match(u).then((hit) => hit || cache.add(u).catch(() => undefined))),
        ),
      ),
    );
  }
});
