const CACHE_NAME = "bonus-loyalty-shell-v4";
const SHELL_ASSETS = [
  "/",
  "/app",
  "/register",
  "/login",
  "/seller",
  "/admin",
  "/manifest.webmanifest",
  "/static/pwa/manifest.webmanifest"
];

async function cacheShellAssets(cache) {
  await Promise.all(
    SHELL_ASSETS.map(async (url) => {
      try {
        await cache.add(url);
      } catch {
        // Skip assets that fail (e.g. invalid TLS during install).
      }
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cacheShellAssets(cache)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.url.includes("/api/")) {
    return;
  }
  event.respondWith(
    fetch(request).catch(() =>
      caches.match(request).then((cached) => cached || caches.match("/app"))
    )
  );
});
