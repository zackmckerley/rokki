import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/TopBar";
import { AdminBackLink } from "./AdminBackLink";
import { AdminMobileNav } from "./AdminMobileNav";
import {
  ADMIN_NAV_GROUPS,
  ADMIN_NAV_ITEMS,
  type AdminNavItem,
} from "./nav-items";

/**
 * Platform admin shell.
 *
 *   - Gates every /admin/* route on `is_platform_admin = true`
 *   - Adds a thin "PLATFORM ADMIN" ribbon under the TopBar so the operator
 *     never forgets they're in the ops console
 *   - At ≥ md: sticky sidebar with every admin section
 *   - Below md: hamburger in the TopBar opens a slide-in drawer driven
 *     off the same nav-items list, so the desktop and mobile menus
 *     never drift
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect_to=/admin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_platform_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!(profile as { is_platform_admin?: boolean } | null)?.is_platform_admin) {
    redirect("/?error=admin_only");
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg-0">
      <TopBar>
        <AdminMobileNav />
        <AdminBackLink />
        <span className="font-mono text-xs uppercase tracking-wider text-accent">
          Platform admin
        </span>
      </TopBar>
      <div
        role="banner"
        aria-label="You are in the platform admin console"
        className="border-b border-accent/30 bg-accent-subtle/40 px-4 py-1 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-accent"
      >
        Platform admin · all actions audited
      </div>
      <div className="mx-auto flex w-full max-w-7xl flex-1">
        <aside className="sticky top-0 hidden w-52 flex-shrink-0 border-r border-border bg-bg-1 md:block">
          <nav
            aria-label="Admin sections"
            className="flex flex-col gap-0.5 p-2 text-sm"
          >
            {ADMIN_NAV_GROUPS.map((group) => {
              const items = ADMIN_NAV_ITEMS.filter((i) => i.group === group);
              if (items.length === 0) return null;
              return (
                <NavGroup key={group} label={group}>
                  {items.map((item) => (
                    <NavLink key={item.href} item={item} />
                  ))}
                </NavGroup>
              );
            })}
          </nav>
        </aside>
        <main className="flex-1 overflow-x-auto p-3 sm:p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

function NavGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <div className="px-2 pb-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-text-3">
        {label}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function NavLink({ item }: { item: AdminNavItem }) {
  return (
    <Link
      href={item.href}
      className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-text-2 hover:bg-bg-2 hover:text-text-0"
    >
      <span className="text-text-3">{item.icon}</span>
      {item.label}
    </Link>
  );
}
