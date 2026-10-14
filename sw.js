// Matt's Square App — service worker for MSA v1
// Change APP_VERSION on every release so phones drop the old cache and load the new build.
const APP_VERSION = "msa-v1";
const CACHE_NAME = "matts-square-" + APP_VERSION;

// Only files this app actually uses. Missing optional files are skipped instead of
// breaking the install (cache.addAll fails completely if any one file is missing).
const APP_SHELL = [
  "./",
  "./index.html",
  "./shared.html",
  "./manifest.webmanifest",
  "./msa-logo.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.all(
        APP_SHELL.map(path =>
          fetch(path, { cache: "no-store" })
            .then(res => { if (res.ok) return cache.put(path, res); })
            .catch(() => {})
        )
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Never touch the Google Apps Script backend or any other site — live board data must stay live.
  if (url.origin !== self.location.origin) return;

  // Pages (index.html, shared.html, with or without ?board=…): network first, so the newest
  // build always loads when online; fall back to the cached copy of THAT page when offline.
  if (request.mode === "navigate") {
    const path = url.pathname.endsWith("/") ? url.pathname + "index.html" : url.pathname;
    const cacheKey = new URL(path, self.location.origin).href; // query string removed
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(cacheKey, copy));
          }
          return response;
        })
        .catch(() =>
          caches.match(cacheKey)
            .then(hit => hit || caches.match("./index.html"))
        )
    );
    return;
  }

  // Logo, manifest, sw-cached files: cache first, then network (and keep a copy).
  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok && response.type === "basic") {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    }))
  );
});
