"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";

/**
 * Admin chip surfaced in the TopBar for platform admins. Hidden when:
 *   - the user isn't a platform admin (the API returns is_platform_admin=false)
 *   - the user is unauthenticated
 *   - the user is already inside `/admin` (no point linking to where they are)
 *
 * Reads the flag once via /api/v1/me, then caches the result for the
 * lifetime of the tab via sessionStorage so we don't fire a request on
 * every navigation.
 */
const CACHE_KEY = "rokki_admin_flag_v1";

export function AdminChip() {
  const pathname = usePathname() ?? "/";
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    // sessionStorage is per-tab, which matches the lifecycle of an admin's
    // session well enough for a UI hint.
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached === "1") {
        setIsAdmin(true);
        return;
      }
      if (cached === "0") {
        setIsAdmin(false);
        return;
      }
    } catch {
      // sessionStorage not available — fall through to fetch.
    }

    fetch("/api/v1/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (body: {
          data?: { is_platform_admin?: boolean };
        } | null) => {
          const flag = Boolean(body?.data?.is_platform_admin);
          setIsAdmin(flag);
          try {
            sessionStorage.setItem(CACHE_KEY, flag ? "1" : "0");
          } catch {}
        },
      )
      .catch(() => setIsAdmin(false));
  }, []);

  if (isAdmin !== true) return null;
  if (pathname.startsWith("/admin")) return null;

  return (
    <Link
      href="/admin"
      className="inline-flex items-center gap-1 rounded-sm border border-accent/40 bg-accent-subtle px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-accent hover:bg-accent/20"
      title="Open the platform admin console"
    >
      <ShieldCheck className="h-2.5 w-2.5" />
      Admin
    </Link>
  );
}
