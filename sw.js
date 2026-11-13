// Service worker : app instantanée et utilisable hors ligne ; toujours la dernière version quand on est en ligne.
const VERSION = "ibifit-v25";
const SHELL = ["./", "index.html", "styles.css", "manifest.webmanifest", "js/app.js", "js/core.js", "js/store.js", "js/ocr.js", "js/places.js", "js/story.js", "js/recap.js", "js/sat.js", "js/health.js",
  "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req, { ignoreSearch: true })) || (await cache.match("index.html")) || Response.error();
  }
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(networkFirst(e.request.mode === "navigate" ? new Request("./") : e.request));
});
