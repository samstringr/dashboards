/* sw.js — cache the app shell so it opens with no signal.
   ⚠ Deliberately does NOT cache GitHub API responses. The CSV is the source of
   truth and a cached copy of it is a second home for the same fact, which is the
   failure this base has hit three times. Offline writes go to the queue in
   store.js instead, and drain when the network returns. */

const CACHE = "diet-v1";
const SHELL = [
  "./", "./index.html", "./diet.css", "./app.js", "./state.js", "./data.js",
  "./presets.js", "./engine.js", "./editors.js", "./render.js", "./chart.js",
  "./manifest.json", "../../shared/tokens.css", "../../shared/store.js",
  "../../shared/targets.js",
  "../../shared/vendor/chart.umd.min.js"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (url.hostname === "api.github.com") return;          // never cache the data
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then(r => { const c = r.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); return r; })
      .catch(() => caches.match(e.request).then(m => m || caches.match("./index.html")))
  );
});
