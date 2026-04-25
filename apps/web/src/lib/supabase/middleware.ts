import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@rokki/db";

interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

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
  const isPublic =
    pathname === "/login" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/v1/auth/") ||
    pathname.startsWith("/api/v1/health") ||
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
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
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
        return NextResponse.json(
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
