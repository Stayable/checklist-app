// StayCheck — minimal hand-rolled service worker (Week-1 PWA shell).
//
// NOTE (ADR/stack): CLAUDE.md names Workbox for the SW layer. A full Workbox
// `generateSW` build step does not yet play cleanly with Next 15 + Turbopack, so
// this is a deliberately small hand-rolled stand-in that delivers the Week-1 DoD
// (installable + offline navigation fallback). Swap to Workbox once the build
// pipeline is settled — tracked in TODO.md. Keep this file dependency-free.

const VERSION = "v1";
const STATIC_CACHE = `stayable-static-${VERSION}`;
const RUNTIME_CACHE = `stayable-runtime-${VERSION}`;
const OFFLINE_URL = "/offline.html";

// App-shell assets worth precaching so the offline fallback always renders.
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/app.webmanifest",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
  "/icons/icon-maskable.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  // Drop caches from older versions on activate.
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET; never interfere with auth POSTs, photo uploads, etc.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first, fall back to cached offline page when down.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((cached) => cached ?? Response.error()),
      ),
    );
    return;
  }

  // Static assets (Next build output + icons): cache-first, then network.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/app.webmanifest"
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
  }
});
