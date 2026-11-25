/**
 * Service worker: makes the app open without a network and keeps repeat opens fast.
 *
 * - Page loads go to the network first, so a deploy reaches the phone on the next
 *   open; the cached copy is only the offline fallback.
 * - /assets/* are fingerprinted by Vite and never change, so they are served from
 *   the cache once fetched.
 * - Everything else (SL's APIs included) is left to the browser.
 *
 * Nothing here needs bumping on release.
 */

const CACHE = "sl-easy";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Caches left behind by the GitHub Pages version (sl-easy-v1 ...).
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

/** Drop fingerprinted files the current page no longer references. */
async function prune(cache, html) {
  for (const request of await cache.keys()) {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/assets/") && !html.includes(path)) await cache.delete(request);
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const response = await fetch(request);
          if (response.ok) {
            await cache.put("/", response.clone());
            event.waitUntil(response.clone().text().then((html) => prune(cache, html)));
          }
          return response;
        } catch {
          return (await cache.match("/")) ?? Response.error();
        }
      })(),
    );
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      })(),
    );
  }
});
