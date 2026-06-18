// #82 — Daymaster service worker (offline app shell). Deliberately conservative so
// it can never strand the live single-user app on a stale build:
//   • navigations   → network-first, fall back to the cached shell only when offline
//   • /assets/* (content-hashed, immutable) → cache-first
//   • other same-origin GETs (icons, manifest) → stale-while-revalidate
//   • cross-origin (Google GSI/Drive, MSAL, the API Worker, fonts) → bypassed; never
//     cached, so auth + sync always hit the network.
// Bump VERSION to invalidate every cache on the next activation.
const VERSION = "dm-v1";
const ASSET_CACHE = `${VERSION}-assets`;
const PAGE_CACHE = `${VERSION}-pages`;
const SHELL = new URL(self.registration.scope).pathname; // e.g. "/daymaster/"

self.addEventListener("install", () => {
  self.skipWaiting(); // a freshly deployed SW takes over immediately
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // bypass cross-origin entirely

  // App-shell navigations: always try the network first so a new deploy (and its new
  // hashed assets) is picked up online; fall back to the cached shell when offline.
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        const cache = await caches.open(PAGE_CACHE);
        cache.put(SHELL, res.clone());
        return res;
      } catch {
        const cache = await caches.open(PAGE_CACHE);
        return (await cache.match(SHELL)) || (await cache.match(req)) || Response.error();
      }
    })());
    return;
  }

  // Content-hashed build assets are immutable → cache-first.
  if (url.pathname.includes("/assets/")) {
    e.respondWith((async () => {
      const cache = await caches.open(ASSET_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  // Everything else same-origin (icons, manifest) → stale-while-revalidate.
  e.respondWith((async () => {
    const cache = await caches.open(ASSET_CACHE);
    const hit = await cache.match(req);
    const network = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || network;
  })());
});
