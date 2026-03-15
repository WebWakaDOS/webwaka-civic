/**
 * WebWaka Civic — Service Worker
 * Blueprint Reference: Part 9.5 (PWA First), Part 9.6 (Offline First)
 *
 * Strategy:
 * - Shell: Cache-First (app shell, fonts, icons)
 * - API: Network-First with offline fallback
 * - Background Sync: queues mutations when offline
 */

const CACHE_VERSION = "v1";
const SHELL_CACHE = `webwaka-civic-shell-${CACHE_VERSION}`;
const DATA_CACHE = `webwaka-civic-data-${CACHE_VERSION}`;
const SYNC_TAG = "webwaka-civic-sync";

const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/offline.html",
  "/manifest.json",
];

// ─── Install ──────────────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ─── Activate ─────────────────────────────────────────────────────────────────

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== DATA_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── Fetch ────────────────────────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin requests
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // API requests: Network-First
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirstWithCache(request));
    return;
  }

  // Shell assets: Cache-First
  event.respondWith(cacheFirstWithNetwork(request));
});

async function networkFirstWithCache(request) {
  try {
    const response = await fetch(request.clone());
    if (response.ok) {
      const cache = await caches.open(DATA_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached ?? new Response(
      JSON.stringify({ success: false, error: "Offline — data not available" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function cacheFirstWithNetwork(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request.clone());
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Return offline page for navigation requests
    if (request.mode === "navigate") {
      return caches.match("/offline.html");
    }
    return new Response("Offline", { status: 503 });
  }
}

// ─── Background Sync ──────────────────────────────────────────────────────────

self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(processOfflineMutations());
  }
});

async function processOfflineMutations() {
  // Notify all clients to trigger the Dexie sync engine
  const clients = await self.clients.matchAll({ type: "window" });
  for (const client of clients) {
    client.postMessage({ type: "SYNC_REQUESTED", tag: SYNC_TAG });
  }
}

// ─── Push Notifications ───────────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "WebWaka Civic", body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? "WebWaka Civic", {
      body: payload.body ?? "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-96.png",
      tag: payload.tag ?? "webwaka-civic",
      data: payload.data ?? {},
      requireInteraction: false,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        if (clients.length > 0) {
          return clients[0].focus();
        }
        return self.clients.openWindow("/");
      })
  );
});
