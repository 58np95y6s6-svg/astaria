// Service worker : l'app s'ouvre instantanément et fonctionne hors ligne
// avec les dernières données consultées.
const VERSION = "astaria-v3";
const SHELL = [
  "./", "index.html", "styles.css", "manifest.webmanifest",
  "js/app.js", "js/model.js", "js/value.js", "js/factors.js", "js/data.js", "js/odds.js", "js/journal.js", "js/picks.js",
  "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw new Error("hors ligne");
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreSearch: true });
  const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || Response.error();
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Cotes : jamais de cache réseau ici (géré par l'app, 10 min).
  if (url.hostname === "api.the-odds-api.com") return;
  // Données NBA publiées par GitHub : réseau d'abord, dernière version en secours.
  if (url.hostname === "raw.githubusercontent.com") { e.respondWith(networkFirst(req, `${VERSION}-data`)); return; }
  // Logos et photos ESPN.
  if (/espncdn\.com$/.test(url.hostname)) { e.respondWith(staleWhileRevalidate(req, `${VERSION}-img`)); return; }
  // Application elle-même.
  if (url.origin === location.origin) {
    if (req.mode === "navigate") { e.respondWith(networkFirst(new Request("./"), VERSION).catch(() => caches.match("index.html"))); return; }
    e.respondWith(staleWhileRevalidate(req, VERSION));
  }
});
