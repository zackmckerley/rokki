"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CheckSquare,
  Calendar,
  MessageSquare,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Bottom tab bar for small screens. Mirrors the 5 most-used destinations
 * that the desktop explorer and right rail surface. Only visible below
 * the `lg` breakpoint — desktop keeps the rails.
 */
const TABS: Array<{
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  match: (path: string) => boolean;
}> = [
  {
    href: "/",
    label: "Home",
    icon: LayoutDashboard,
    match: (p) => p === "/",
  },
  {
    href: "/tasks/mine",
    label: "Tasks",
    icon: CheckSquare,
    match: (p) => p.startsWith("/tasks"),
  },
  {
    href: "/calendar",
    label: "Week",
    icon: Calendar,
    match: (p) => p.startsWith("/calendar"),
  },
  {
    href: "/messages",
    label: "Inbox",
    icon: MessageSquare,
    match: (p) => p.startsWith("/messages"),
  },
  {
    href: "/settings",
    label: "More",
    icon: MoreHorizontal,
    match: (p) => p.startsWith("/settings") || p.startsWith("/tools"),
  },
];

export function MobileTabBar() {
  const pathname = usePathname() ?? "/";
  return (
    <nav
      aria-label="Primary"
      className="flex h-14 flex-shrink-0 items-stretch border-t border-border bg-bg-1 md:hidden"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium",
              active
                ? "text-accent"
                : "text-text-3 hover:text-text-1",
            )}
          >
            <Icon
              className={cn(
                "h-5 w-5",
                active ? "text-accent" : "text-text-2",
              )}
              aria-hidden="true"
            />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
