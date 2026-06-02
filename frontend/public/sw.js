const CACHE_NAME = "bonus-loyalty-shell-v1";
const SHELL_ASSETS = ["/", "/app", "/register", "/seller", "/admin", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
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
