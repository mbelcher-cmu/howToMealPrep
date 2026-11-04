/* Prep Cart offline support: pages are network-first with a cached fallback, build assets are cache-first. */
const scope = self.registration.scope;
// one cache per scope, so the staging build under /staging/ never clears production's cache
const CACHE = "prep-cart-v1:" + scope;
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([scope, scope + "groceries/", scope + "shop/", scope + "prep/", scope + "highs.js", scope + "highs.wasm"]).catch(() => {})));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && (k === "prep-cart-v1" || k.endsWith(":" + scope))).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || !req.url.startsWith(scope)) return;
  const url = new URL(req.url);
  const immutable = url.pathname.includes("/_next/static/") || /\.(wasm|png|woff2?)$/.test(url.pathname) || url.pathname.endsWith("/highs.js");
  if (immutable) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; })));
    return;
  }
  e.respondWith(fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; })
    .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match(scope))));
});
