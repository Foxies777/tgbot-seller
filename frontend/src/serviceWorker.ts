const SERVICE_WORKER_URL = "/sw.js";

function serviceWorkerEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_SW === "1";
}

async function unregisterServiceWorkers(): Promise<void> {
  if (!("serviceWorker" in navigator)) {
    return;
  }
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
}

async function registerServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) {
    return;
  }
  try {
    const response = await fetch(SERVICE_WORKER_URL, {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin"
    });
    if (!response.ok) {
      return;
    }
    await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: "/" });
  } catch {
    // Self-signed or untrusted TLS — skip without console SecurityError.
  }
}

export async function initServiceWorker(): Promise<void> {
  if (!serviceWorkerEnabled()) {
    await unregisterServiceWorkers();
    return;
  }
  await registerServiceWorker();
}
