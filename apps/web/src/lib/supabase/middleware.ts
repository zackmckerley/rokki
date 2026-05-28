import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@rokki/db";
import { applySecurityHeaders } from "@/lib/security-headers";

interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  applySecurityHeaders(response.headers);
  applyApiCacheHeader(request, response);

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }: CookieToSet) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          // Re-apply on every fresh response — security headers must
          // never be lost just because Supabase rebuilt the response to
          // attach refresh cookies. Cache-Control follows the same rule:
          // a refresh-cookie response that lets an intermediary cache
          // /api/v1/me would be a serious staleness bug.
          applySecurityHeaders(response.headers);
          applyApiCacheHeader(request, response);
          cookiesToSet.forEach(({ name, value, options }: CookieToSet) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refreshes session; must be called before Server Components render
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Auth gate — unauthenticated users can only reach /login, auth
  // callback, and the auth-initiation endpoints (send-link / password-login
  // / share-link viewer). Those have to be reachable without a session
  // because they're *how* you get a session.
  const { pathname } = request.nextUrl;
  // Image scrapers (Slack, iMessage, Twitter) hit OG / Twitter cards
  // unauthenticated. Gating them behind /login defeats the entire
  // purpose of share-link previews.
  const isMetadataImage =
    pathname === "/opengraph-image" ||
    pathname === "/twitter-image" ||
    /^\/p\/[^/]+\/(opengraph-image|twitter-image)$/.test(pathname);
  const isPublic =
    isMetadataImage ||
    pathname === "/login" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/v1/auth/") ||
    pathname.startsWith("/api/v1/health") ||
    pathname.startsWith("/api/v1/cron/") ||
    pathname.startsWith("/api/v1/share/") ||
    pathname.startsWith("/r/") ||
    pathname === "/help" ||
    pathname === "/privacy" ||
    pathname === "/terms" ||
    (process.env.NODE_ENV !== "production" && pathname.startsWith("/api/dev/"));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect_to", pathname);
    const redirect = NextResponse.redirect(url);
    applySecurityHeaders(redirect.headers);
    return redirect;
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    const redirect = NextResponse.redirect(url);
    applySecurityHeaders(redirect.headers);
    return redirect;
  }

  // Maintenance-mode write gate. Reads the `maintenance_mode` feature
  // flag (global, no rollout) and short-circuits any non-GET API request
  // with 503. Platform admins are exempt so they can still set/clear the
  // flag itself. UI navigation (GET) keeps working — the
  // <MaintenanceBanner/> already tells users what's going on.
  const isWriteApi =
    pathname.startsWith("/api/") &&
    request.method !== "GET" &&
    request.method !== "HEAD" &&
    request.method !== "OPTIONS" &&
    // Always allow auth + sign-out + admin-side flag flip even in
    // maintenance — otherwise admins can lock themselves out.
    !pathname.startsWith("/api/v1/auth/") &&
    !pathname.startsWith("/api/v1/admin/flags") &&
    !pathname.startsWith("/api/v1/admin/users/") &&
    !pathname.startsWith("/api/dev/");

  if (isWriteApi && user) {
    const isMaintenance = await maintenanceModeOn(supabase);
    if (isMaintenance) {
      const isAdmin = await callerIsPlatformAdmin(supabase, user.id);
      if (!isAdmin) {
        const blocked = NextResponse.json(
          {
            errors: [
              {
                code: "maintenance_mode",
                message:
                  "Rokki is in read-only maintenance. Try again in a few minutes.",
              },
            ],
          },
          { status: 503, headers: { "Retry-After": "60" } },
        );
        applySecurityHeaders(blocked.headers);
        return blocked;
      }
    }
  }

  return response;
}

/**
 * Read the `maintenance_mode` feature flag value. Cached at the request
 * level via the supabase client; if RLS lets the row through, treat any
 * truthy `enabled` field as "on". Resilient to schema drift — a missing
 * row, missing column, or query error all read as "off".
 */
async function maintenanceModeOn(
  supabase: ReturnType<typeof createServerClient<Database>>,
): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("feature_flags")
      .select("value, scope")
      .eq("key", "maintenance_mode")
      .eq("scope", "global")
      .maybeSingle();
    const v = (data as { value?: { enabled?: boolean } } | null)?.value;
    return Boolean(v?.enabled);
  } catch {
    return false;
  }
}

/**
 * Stamp `Cache-Control: private, no-store` on every `/api/*` response so
 * no intermediary (Vercel edge, Cloudflare, the user's browser cache, a
 * corporate proxy) can hold on to a copy and serve it back to anyone.
 *
 * Belt-and-suspenders alongside the service worker's network-first
 * strategy: the SW protects same-tab repeat hits, this header protects
 * everything else in the chain. Without it, a Vercel edge cache hit on
 * `/api/v1/me` between user X and user Y would be a data-leak as well
 * as a staleness bug.
 *
 * Public surfaces (the OG image generators, /api/openapi.json,
 * /api/docs) are intentionally cacheable — they're already marked as
 * such with `export const dynamic = "force-static"` etc. and don't pass
 * through this middleware path (matcher excludes static media; the
 * openapi route handler emits its own Cache-Control which would
 * override us here anyway).
 *
 * The `image` paths in metadata (`/opengraph-image`, `/twitter-image`,
 * `/p/<slug>/opengraph-image`, `/p/<slug>/twitter-image`) are excluded
 * because OG scrapers (Slack, iMessage) want them cacheable.
 */
function applyApiCacheHeader(request: NextRequest, response: NextResponse) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/api/")) return;
  // Don't overwrite anything the route already set deliberately.
  if (response.headers.has("cache-control")) return;
  response.headers.set("Cache-Control", "private, no-store");
}

async function callerIsPlatformAdmin(
  supabase: ReturnType<typeof createServerClient<Database>>,
  userId: string,
): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("is_platform_admin")
      .eq("user_id", userId)
      .maybeSingle();
    return Boolean(
      (data as { is_platform_admin?: boolean } | null)?.is_platform_admin,
    );
  } catch {
    return false;
  }
}
