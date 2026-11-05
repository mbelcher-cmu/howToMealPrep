/*
 * MacroAisle offline support.
 * - Install: precache the app shell (every main page, its scripts, fonts, food photos and the solver),
 *   so the app works offline even on pages the person has not opened yet. The list and BUILD are
 *   written in by scripts/sw-precache.mjs after `next build`; in this source file they are empty.
 * - Pages: network first, but fall back to the cached copy after a few seconds, so a weak signal in a
 *   store aisle doesn't leave the shopping list spinning.
 * - Build assets (hashed file names): cache first.
 */
const PRECACHE = /*__PRECACHE__*/[];
const BUILD = "/*__BUILD__*/dev";
const scope = self.registration.scope;
// one cache per build and scope, so the staging build under /staging/ never clears production's cache
const CACHE = "macroaisle-" + BUILD + ":" + scope;
const PAGE_TIMEOUT_MS = 3500;

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    const urls = PRECACHE.length ? PRECACHE.map((p) => scope + p) : [scope, scope + "groceries/", scope + "shop/", scope + "prep/", scope + "highs.js", scope + "highs.wasm"];
    // one missing file must not stop the rest from caching
    await Promise.all(urls.map((u) => c.add(new Request(u, { cache: "reload" })).catch(() => {})));
  })());
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && (k === "prep-cart-v1" || k.endsWith(":" + scope))).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function put(req, res) {
  if (res.ok && res.type === "basic") {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || !req.url.startsWith(scope)) return;
  const url = new URL(req.url);
  const immutable = url.pathname.includes("/_next/static/") || /\.(wasm|png|webp|woff2?)$/.test(url.pathname) || url.pathname.endsWith("/highs.js");
  if (immutable) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => put(req, res))));
    return;
  }
  e.respondWith((async () => {
    const network = fetch(req).then((res) => put(req, res));
    const cached = () => caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === "navigate" ? caches.match(scope) : undefined));
    // keep the network request going in the background either way, so the cache stays fresh
    e.waitUntil(network.catch(() => {}));
    const slow = new Promise((resolve) => setTimeout(resolve, PAGE_TIMEOUT_MS, "slow"));
    const first = await Promise.race([network.catch(() => "failed"), slow]);
    if (first !== "slow" && first !== "failed") return first;
    const hit = await cached();
    if (hit) return hit;
    // nothing cached: wait for the network after all (or report it failed)
    return network.catch(() => Response.error());
  })());
});
