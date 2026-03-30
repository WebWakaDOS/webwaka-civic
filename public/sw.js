/**
 * WebWaka Civic — Service Worker
 * Blueprint Reference: Part 9.5 (PWA First), Part 9.6 (Offline First)
 *
 * Strategy:
 * - Shell: Cache-First (app shell, fonts, icons)
 * - API GETs: Network-First with offline fallback
 * - API mutations (POST/PATCH/DELETE): queued to IndexedDB when offline,
 *   replayed on BackgroundSync tag "webwaka-civic-sync"
 */

const CACHE_VERSION = "v2";
const SHELL_CACHE = `webwaka-civic-shell-${CACHE_VERSION}`;
const DATA_CACHE  = `webwaka-civic-data-${CACHE_VERSION}`;
const SYNC_TAG    = "webwaka-civic-sync";

/** IndexedDB helpers — no library dependency */
const IDB_NAME    = "webwaka-civic-sw";
const IDB_VERSION = 1;
const IDB_STORE   = "mutation-queue";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

async function idbAdd(entry) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(IDB_STORE, "readwrite");
    const req = tx.objectStore(IDB_STORE).add(entry);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function idbGetAll() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function idbDelete(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(IDB_STORE, "readwrite");
    const req = tx.objectStore(IDB_STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

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

  // Skip cross-origin requests entirely
  if (url.origin !== self.location.origin) return;

  // API mutations — intercept and queue when offline
  const isMutation = ["POST", "PATCH", "PUT", "DELETE"].includes(request.method);
  if (url.pathname.startsWith("/api/") && isMutation) {
    event.respondWith(networkOrQueue(request));
    return;
  }

  // API GETs — Network-First with cache fallback
  if (url.pathname.startsWith("/api/") && request.method === "GET") {
    event.respondWith(networkFirstWithCache(request));
    return;
  }

  // Shell assets — Cache-First
  event.respondWith(cacheFirstWithNetwork(request));
});

/** Attempt network; on failure serialize the request and queue it. */
async function networkOrQueue(request) {
  try {
    const response = await fetch(request.clone());
    return response;
  } catch {
    // Serialize request for later replay
    const body = await request.clone().text().catch(() => "");
    const headersObj = {};
    request.headers.forEach((v, k) => { headersObj[k] = v; });

    const entry = {
      url:       request.url,
      method:    request.method,
      headers:   headersObj,
      body:      body || null,
      queuedAt:  Date.now(),
    };

    try {
      await idbAdd(entry);
      // Ask the browser to trigger background sync when connectivity returns
      await self.registration.sync.register(SYNC_TAG).catch(() => {});
      notifyClients({ type: "MUTATION_QUEUED", url: entry.url, method: entry.method });
    } catch (err) {
      // IDB unavailable — best effort
      console.warn("[SW] Could not queue mutation:", err);
    }

    return new Response(
      JSON.stringify({ success: false, offline: true, queued: true }),
      {
        status: 202,
        headers: { "Content-Type": "application/json", "X-SW-Queued": "true" },
      }
    );
  }
}

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
    if (request.mode === "navigate") {
      return caches.match("/offline.html");
    }
    return new Response("Offline", { status: 503 });
  }
}

// ─── Background Sync — Replay Queued Mutations ────────────────────────────────

self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(replayQueuedMutations());
  }
});

async function replayQueuedMutations() {
  let entries;
  try {
    entries = await idbGetAll();
  } catch (err) {
    console.warn("[SW] Cannot read mutation queue:", err);
    return;
  }

  if (!entries || entries.length === 0) return;

  const results = { replayed: 0, failed: 0, remaining: 0 };

  for (const entry of entries) {
    try {
      const init = {
        method:  entry.method,
        headers: entry.headers,
        body:    entry.body ?? undefined,
      };
      // Remove content-length to avoid mismatch on replay
      delete init.headers["content-length"];

      const response = await fetch(entry.url, init);

      if (response.ok || (response.status >= 200 && response.status < 300)) {
        await idbDelete(entry.id);
        results.replayed++;
      } else if (response.status >= 400 && response.status < 500) {
        // 4xx — discard unrecoverable mutations (bad request, gone, etc.)
        console.warn(`[SW] Discarding unrecoverable mutation ${entry.method} ${entry.url} (${response.status})`);
        await idbDelete(entry.id);
        results.failed++;
      } else {
        // 5xx or network error — leave in queue for next sync attempt
        results.remaining++;
      }
    } catch {
      // Network still unavailable — will retry on next sync
      results.remaining++;
    }
  }

  notifyClients({ type: "SYNC_COMPLETE", ...results });
  console.info(`[SW] Background sync: replayed=${results.replayed} failed=${results.failed} remaining=${results.remaining}`);
}

// ─── Message passing ──────────────────────────────────────────────────────────

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ type: "window" });
  for (const client of clients) {
    client.postMessage(message);
  }
}

// ─── Message handler (from app) ───────────────────────────────────────────────

self.addEventListener("message", (event) => {
  if (!event.data) return;

  switch (event.data.type) {
    case "SKIP_WAITING":
      self.skipWaiting();
      break;

    case "GET_QUEUE_COUNT":
      idbGetAll()
        .then((entries) => {
          event.source?.postMessage({
            type: "QUEUE_COUNT",
            count: entries.length,
          });
        })
        .catch(() => {});
      break;

    case "FLUSH_QUEUE":
      replayQueuedMutations().catch(console.warn);
      break;
  }
});

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
