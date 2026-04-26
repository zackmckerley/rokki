"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Admin sidebar nav item. Client-side because it needs `usePathname` to
 * highlight the active route. Vercel-style: wider hit area, slightly
 * larger icon, subtle active-bg + text-0 on the current page.
 *
 * `exact` defaults false → "/admin" highlights for any path under it.
 * Pass `exact` for routes like the bare "/admin" overview that would
 * otherwise stay perpetually-highlighted.
 */
export function AdminNavLink({
  href,
  icon,
  exact = false,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  exact?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded px-3 py-2 text-[13px] transition-colors",
        active
          ? "bg-bg-2 text-text-0"
          : "text-text-2 hover:bg-bg-2/60 hover:text-text-0",
      )}
    >
      <span
        className={cn(
          "flex-shrink-0 transition-colors",
          active ? "text-text-1" : "text-text-3",
        )}
      >
        {icon}
      </span>
      <span className="flex-1 truncate">{children}</span>
    </Link>
  );
}
