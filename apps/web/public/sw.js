// Rokki service worker — offline-mode v2.
//
// Strategy summary:
//   * GET /api/v1/**           → **network-first**, cache only as an
//                                 offline fallback. v6 switched away from
//                                 stale-while-revalidate after a
//                                 cross-device staleness report (see the
//                                 v6 note below). Skip /api/v1/auth/**,
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

// Bumped to v6 (2026-05-27):
//   * v5 was the cosmos-video / hydration-drift fix.
//   * v6 changes the API strategy from stale-while-revalidate to
//     **network-first with cache fallback**. Zack reported "I was
//     trying to use rokki from another computer and it was
//     uploading older information. like it didn't have all of the
//     most recent tasks uploaded." Root cause: the SWR strategy
//     returned the cached API response IMMEDIATELY on every
//     same-device repeat visit and only refreshed in the
//     background. With a 7-day TTL, a return-visiting user saw up
//     to 7-day-old data until the background refresh re-rendered.
//     Network-first preserves the offline-mode safety net (cache
//     is still consulted on fetch failure) but defaults to fresh
//     data on every online request. Version bumped so v5 SWs in
//     the wild eject the stale `rokki-api-v1` cache on next
//     activate (we also rename the cache below so the eviction is
//     belt-and-suspenders).
const CACHE_VERSION = "v6";
const SHELL_CACHE = `rokki-shell-${CACHE_VERSION}`;
// Renamed (was `rokki-api-v1`) so v5-cached entries get garbage-collected
// by the activate handler — guarantees no stale row sticks around through
// the strategy change.
const API_CACHE = `rokki-api-${CACHE_VERSION}`;
const STATIC_CACHE = `rokki-static-${CACHE_VERSION}`;

// Files to seed at install. Keep this list short — the page-cache strategy
// will warm everything else on first visit.
const SHELL = ["/", "/offline", "/manifest.webmanifest"];

// Offline-fallback freshness floor. The API cache is only consulted when
// the network actually fails (we're network-first now); even then, we
// only serve cached rows younger than this. 7 days was the old TTL when
// the cache was used on every request — overly generous now that we only
// touch it offline. Kept at 7 days because the use case ("user is
// offline on a plane for a week and wants to see *something*") still
// benefits from a long tail.
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
    event.respondWith(networkFirstApi(req));
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

async function networkFirstApi(req) {
  // ALWAYS try the network first. Cache is only used as an offline
  // fallback (when fetch itself rejects — DNS failure, no connectivity,
  // etc.). This is the v6 strategy that replaces the v5
  // stale-while-revalidate path that caused cross-device staleness.
  const cache = await caches.open(API_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok && res.status !== 206) {
      // Stash a fresh copy for offline mode. Stamped with `x-rokki-cached-at`
      // so the TTL check below can age it out.
      const wrapped = await stamp(res.clone());
      // Fire-and-forget — page already has its response.
      cache.put(req, wrapped).catch(() => {});
    }
    return res;
  } catch (err) {
    // Network failed (likely offline). Try the cache as a last resort,
    // but only if the entry is still within the offline-fallback TTL.
    const cached = await cache.match(req);
    if (cached) {
      const age = readCachedAge(cached);
      if (age != null && Date.now() - age <= API_TTL_MS) {
        return cached;
      }
      // Expired — drop it so we don't accumulate stale rows.
      await cache.delete(req);
    }
    throw err;
  }
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
