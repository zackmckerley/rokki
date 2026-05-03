// Rokki service worker — offline-mode v2.
//
// Strategy summary:
//   * GET /api/v1/**           → stale-while-revalidate, cache `rokki-api-v1`,
//                                 7-day expiry. Skip /api/v1/auth/**,
//                                 Cache-Control: no-store, and any
//                                 non-GET method.
//   * Page navigations         → network-only with /offline fallback on
//                                 fetch failure. We deliberately do NOT
//                                 cache HTML — see CACHE_VERSION v5
//                                 below for why.
//   * /_next/static/**         → cache-first (build hash invalidates).
//   * Other same-origin GETs   → cache-first with background refresh
//                                 (the previous shell behaviour).
//
// Mutations (POST/PATCH/PUT/DELETE) are NOT touched here — the application
// layer (apps/web/src/lib/offline-fetch.ts) intercepts those and queues them
// in IndexedDB when the browser is offline. See `processQueue` for the drain.
//
// Cache version bumps on schema changes. Bump CACHE_VERSION to invalidate.

// Bumped to v5 (2026-05-03):
//   * v3 added the RSC short-circuit so Next.js client-side navigation
//     stops hitting the cache.
//   * v4 broadcasts an SW_ACTIVATED message to all open clients on
//     activate, so already-open tabs auto-reload onto the new SW
//     instead of staying stuck on whatever the old SW was doing.
//   * v5 stops caching HTML page responses entirely. The
//     "networkFirstPage with cache fallback" strategy was the root
//     cause of a React #418 hydration crash: when a deploy bumped JS
//     chunk hashes, the SW could hand back a stale page HTML whose
//     embedded SSR output (e.g. tickerItems with "5m ago") no longer
//     matched what the freshly-shipped TickerTape component would
//     render against the same props on the client. Hydration died,
//     event handlers never attached, and every Link click on
//     terminal pages silently no-op'd. Symptom upstream: clicks on
//     /p/<ticker> didn't navigate, NavigationFallback fell through
//     to a hard reload (white flash). Removing the page cache
//     eliminates the drift window. /offline is still seeded at
//     install for true-offline visits.
//   * Bumped the version so every v4 user purges the bad pages cache
//     on next visit (the activate handler nukes anything not in the
//     expected name set).
const CACHE_VERSION = "v5";
const SHELL_CACHE = `rokki-shell-${CACHE_VERSION}`;
const API_CACHE = "rokki-api-v1";
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

// Respond to version-check pings from the page so ServiceWorkerRegister
// can detect "I'm controlled by an old SW" and force a reload. The
// message arrives with a transferred MessagePort; reply through it so
// the page resolves its versionPromise.
//
// Origin check: a SW only receives postMessage from clients within its
// scope, but a malicious iframe loaded into one of those clients could
// still call postMessage on its window's controller. Reject anything
// whose source isn't a same-origin window client.
self.addEventListener("message", (event) => {
  const source = event.source;
  // Ignore messages without a source (e.g. broadcast channel forwards).
  if (!source) return;
  // Only accept from same-origin window clients on our own scope.
  try {
    const sourceUrl = new URL(source.url);
    if (sourceUrl.origin !== self.location.origin) return;
  } catch {
    return;
  }
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (data.type === "VERSION_CHECK") {
    const port = event.ports?.[0];
    if (port) {
      port.postMessage({ type: "VERSION", version: CACHE_VERSION });
    }
  }
});

self.addEventListener("activate", (event) => {
  const expected = new Set([
    SHELL_CACHE,
    API_CACHE,
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
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: "window" }))
      .then((clients) => {
        // Broadcast to every open tab that a new SW just took over.
        // The page-side listener (ServiceWorkerRegister) reloads on
        // receipt so the tab picks up the new SW's responses without
        // the user having to manually refresh / unregister.
        for (const client of clients) {
          client.postMessage({
            type: "SW_ACTIVATED",
            version: CACHE_VERSION,
          });
        }
      }),
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

  // Next.js App Router — RSC payload requests for client-side
  // navigation MUST go straight to the network. They're GETs to page
  // URLs (looks like a normal page hit at the URL level) but carry an
  // `RSC: 1` header and `accept: text/x-component`. If the SW caches
  // them, the router receives stale tree fragments and silently
  // refuses to navigate — including to URLs you've never visited.
  // Symptom: clicks on Links do nothing.
  //
  // Bail on any of:
  //   - explicit RSC header
  //   - text/x-component accept
  //   - server-action POSTs (already excluded above by method != GET,
  //     but listed here for completeness)
  const accept = req.headers.get("accept") ?? "";
  if (
    req.headers.get("RSC") === "1" ||
    req.headers.get("Next-Router-State-Tree") ||
    accept.includes("text/x-component")
  ) {
    return;
  }

  if (url.pathname.startsWith("/api/v1/")) {
    event.respondWith(staleWhileRevalidateApi(req));
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirstStatic(req));
    return;
  }

  // Page navigations: network-only with /offline fallback. We do NOT
  // cache successful HTML responses anymore — caching them caused a
  // hydration drift window across deploys (see CACHE_VERSION comment
  // for the long version). The only fallback is the dedicated
  // /offline page, seeded at install.
  if (req.mode === "navigate" || accept.includes("text/html")) {
    event.respondWith(networkOnlyPage(req));
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

async function networkOnlyPage(req) {
  // Always go to the network for HTML — never serve a cached page,
  // because the cached HTML can race a fresh JS bundle and produce a
  // hydration mismatch. The only fallback is the /offline page, used
  // when fetch itself rejects (true network failure).
  try {
    return await fetch(req);
  } catch (err) {
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
