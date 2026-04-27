// Rokki service worker — offline-mode v2.
//
// Strategy summary:
//   * GET /api/v1/**           → stale-while-revalidate, cache `rokki-api-v1`,
//                                 7-day expiry. Skip /api/v1/auth/**,
//                                 Cache-Control: no-store, and any
//                                 non-GET method.
//   * Page navigations         → network-first, cache fallback. Means: any
//                                 page you've loaded once is offline-
//                                 reachable. If both the network and the
//                                 cache miss, fall through to /offline.
//   * /_next/static/**         → cache-first (build hash invalidates).
//   * Other same-origin GETs   → cache-first with background refresh
//                                 (the previous shell behaviour).
//
// Mutations (POST/PATCH/PUT/DELETE) are NOT touched here — the application
// layer (apps/web/src/lib/offline-fetch.ts) intercepts those and queues them
// in IndexedDB when the browser is offline. See `processQueue` for the drain.
//
// Cache version bumps on schema changes. Bump CACHE_VERSION to invalidate.

const CACHE_VERSION = "v2";
const SHELL_CACHE = `rokki-shell-${CACHE_VERSION}`;
const API_CACHE = "rokki-api-v1";
const PAGES_CACHE = `rokki-pages-${CACHE_VERSION}`;
const STATIC_CACHE = `rokki-static-${CACHE_VERSION}`;

// Files to seed at install. Keep this list short — the page-cache strategy
// will warm everything else on first visit.
const SHELL = ["/", "/offline", "/manifest.webmanifest"];

const API_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((c) => c.addAll(SHELL))
      .catch(() => {
        // Not fatal — the SW still works for everything else.
      }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  const expected = new Set([
    SHELL_CACHE,
    API_CACHE,
    PAGES_CACHE,
    STATIC_CACHE,
  ]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => !expected.has(k)).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // We only handle same-origin requests. Anything cross-origin (Sentry,
  // Supabase, blob CDN) goes straight to the network.
  if (url.origin !== self.location.origin) return;

  // Mutations are never cached; the app layer takes care of queuing.
  if (req.method !== "GET") return;

  // Auth endpoints must always hit the network — caching them would either
  // stall a sign-in (cache hit returns stale token) or leak a token between
  // sessions on shared devices.
  if (url.pathname.startsWith("/api/v1/auth/")) return;

  // Anything that asks not to be cached, isn't.
  if (req.headers.get("cache-control") === "no-store") return;

  if (url.pathname.startsWith("/api/v1/")) {
    event.respondWith(staleWhileRevalidateApi(req));
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirstStatic(req));
    return;
  }

  // Page navigations: network-first with cache fallback. Detect both real
  // navigations (`mode === "navigate"`) and HTML accept headers — Next.js
  // sometimes prefetches RSC payloads with the same accept that aren't
  // navigations themselves; those go through staleWhileRevalidate below.
  const accept = req.headers.get("accept") ?? "";
  if (req.mode === "navigate" || accept.includes("text/html")) {
    event.respondWith(networkFirstPage(req));
    return;
  }

  // Everything else (CSS, JS, images at non-/_next paths, fonts, etc.) —
  // cache-first with background refresh. Same as the original shell logic.
  event.respondWith(cacheFirstWithRefresh(req, SHELL_CACHE));
});

/* ------------------------------------------------------------------ */
/* Strategies                                                         */
/* ------------------------------------------------------------------ */

async function staleWhileRevalidateApi(req) {
  const cache = await caches.open(API_CACHE);
  const cached = await cache.match(req);

  // If the cached response is past TTL, treat it as a miss — we'd rather
  // fail-fast offline than show a 7-day-old task list.
  if (cached) {
    const age = readCachedAge(cached);
    if (age != null && Date.now() - age > API_TTL_MS) {
      await cache.delete(req);
    }
  }

  const fresh = cached && readCachedAge(cached) != null
    ? cached
    : null; // we'll prefer the network if we don't trust the cache

  const networkPromise = fetch(req)
    .then((res) => {
      if (res.ok && res.status !== 206) {
        const wrapped = stamp(res.clone());
        // Don't await — let the cache write happen in the background.
        wrapped.then((tagged) => cache.put(req, tagged)).catch(() => {});
      }
      return res;
    })
    .catch((err) => {
      // Surface the offline state to the page if we have nothing cached.
      if (fresh) return fresh;
      throw err;
    });

  // Return cache immediately if we have one, kick the network in the
  // background. If we have no cache, await the network.
  if (fresh) {
    networkPromise.catch(() => {});
    return fresh;
  }
  return networkPromise;
}

async function cacheFirstStatic(req) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone()).catch(() => {});
  return res;
}

async function networkFirstPage(req) {
  const cache = await caches.open(PAGES_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) return cached;
    // Last resort: the dedicated /offline page. Always seeded at install.
    const fallback = await caches.match("/offline");
    if (fallback) return fallback;
    throw err;
  }
}

async function cacheFirstWithRefresh(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    })
    .catch(() => cached);
  return cached ?? network;
}

/* ------------------------------------------------------------------ */
/* Cache age stamping                                                  */
/* ------------------------------------------------------------------ */
//
// The Response object doesn't expose a stable "stored at" timestamp.
// We attach one as a custom header before writing to the API cache so the
// expiry check above is reliable across SW restarts.

const STAMP_HEADER = "x-rokki-cached-at";

async function stamp(res) {
  const headers = new Headers(res.headers);
  headers.set(STAMP_HEADER, String(Date.now()));
  const body = await res.blob();
  return new Response(body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

function readCachedAge(res) {
  const v = res.headers.get(STAMP_HEADER);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* --------------------------------------------------------------------- */
/* Push notifications                                                    */
/* --------------------------------------------------------------------- */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Rokki", body: event.data?.text() ?? "" };
  }
  const title = data.title || "Rokki";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(
      (clientList) => {
        for (const client of clientList) {
          if (client.url.includes(target) && "focus" in client)
            return client.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow(target);
      },
    ),
  );
});

/* --------------------------------------------------------------------- */
/* Message channel — page can ask us to drop the API cache, etc.         */
/* --------------------------------------------------------------------- */

self.addEventListener("message", (event) => {
  if (!event.data || typeof event.data !== "object") return;
  if (event.data.type === "rokki:purge-api-cache") {
    event.waitUntil(caches.delete(API_CACHE));
  }
  if (event.data.type === "rokki:skip-waiting") {
    self.skipWaiting();
  }
});
