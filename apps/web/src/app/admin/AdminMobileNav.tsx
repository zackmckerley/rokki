"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  ADMIN_NAV_GROUPS,
  ADMIN_NAV_ITEMS,
  type AdminNavItem,
} from "./nav-items";

interface AdminMobileNavProps {
  /**
   * Pinned to the bottom of the drawer. The desktop sidebar gets the
   * AccountBlock from `ExplorerRail`, but admin pages don't render a
   * full ExplorerRail — the layout passes through whatever the page
   * wants pinned at the bottom of the mobile drawer.
   *
   * Currently nothing — we leave the slot here so we can drop an
   * AccountBlock wrapper in once the admin layout grows one. Until then
   * the drawer ends with the nav.
   */
  footer?: React.ReactNode;
}

/**
 * Hamburger + slide-in drawer that replaces the sticky desktop sidebar
 * on viewports below `md`. Uses the same nav-items source as the
 * desktop sidebar so the two never drift.
 *
 * Behavior:
 *   - Tapping the hamburger toggles the drawer.
 *   - Scrim click, Escape, or selecting a nav item closes it.
 *   - While open, body scroll is locked (mobile keyboards keep popping
 *     in otherwise).
 */
export function AdminMobileNav({ footer }: AdminMobileNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close drawer whenever the route changes (covers nav-item taps,
  // back/forward, and any other navigation source).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Escape closes; body scroll-lock while open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open admin navigation"
        aria-expanded={open}
        aria-controls="admin-mobile-drawer"
        className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-border bg-bg-2 text-text-1 hover:bg-bg-3 md:hidden"
      >
        <Menu className="h-3.5 w-3.5" />
      </button>

      {open ? (
        <div
          id="admin-mobile-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Admin navigation"
          className="fixed inset-0 z-40 md:hidden"
        >
          {/* Scrim */}
          <button
            type="button"
            aria-label="Close admin navigation"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-bg-0/70 backdrop-blur-sm"
          />

          {/* Panel */}
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-border bg-bg-1 shadow-lg">
            <div className="flex h-11 flex-shrink-0 items-center justify-between border-b border-border px-3">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
                Admin sections
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close admin navigation"
                className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-text-2 hover:bg-bg-2 hover:text-text-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <nav
              aria-label="Admin sections"
              className="flex-1 overflow-y-auto p-2 text-sm"
            >
              {ADMIN_NAV_GROUPS.map((group) => {
                const items = ADMIN_NAV_ITEMS.filter((i) => i.group === group);
                if (items.length === 0) return null;
                return (
                  <div key={group} className="mb-3">
                    <div className="px-2 pb-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-text-3">
                      {group}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {items.map((item) => (
                        <DrawerNavLink
                          key={item.href}
                          item={item}
                          pathname={pathname ?? ""}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </nav>

            {footer ? (
              <div className="flex-shrink-0 border-t border-border">
                {footer}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function DrawerNavLink({
  item,
  pathname,
}: {
  item: AdminNavItem;
  pathname: string;
}) {
  const active = item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(item.href + "/");
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2 rounded-sm px-2 py-2 text-text-2 hover:bg-bg-2 hover:text-text-0",
        active && "bg-bg-2 text-text-0",
      )}
    >
      <span className={cn("text-text-3", active && "text-accent")}>
        {item.icon}
      </span>
      {item.label}
    </Link>
  );
}
