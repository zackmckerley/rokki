import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Gauge,
  Users,
  Building2,
  Terminal,
  Activity,
  ShieldAlert,
  Ban,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/TopBar";

/**
 * Platform admin shell. Only `profiles.is_platform_admin = true` users
 * can see any child route. This check is defense-in-depth on top of
 * RLS — individual queries inside the pages still enforce admin access
 * via service-role or explicit `is_platform_admin` filters.
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
        <Link href="/" className="text-text-3 hover:text-text-1">
          ← Dashboard
        </Link>
        <span className="text-text-3">·</span>
        <span className="text-accent">Platform admin</span>
      </TopBar>
      <div className="mx-auto flex w-full max-w-6xl flex-1">
        <aside className="sticky top-0 hidden w-48 flex-shrink-0 border-r border-border bg-bg-1 md:block">
          <nav className="flex flex-col gap-0.5 p-2 text-sm">
            <NavLink href="/admin" icon={<Gauge className="h-3.5 w-3.5" />}>
              Overview
            </NavLink>
            <NavLink href="/admin/users" icon={<Users className="h-3.5 w-3.5" />}>
              Users
            </NavLink>
            <NavLink
              href="/admin/spaces"
              icon={<Building2 className="h-3.5 w-3.5" />}
            >
              Spaces
            </NavLink>
            <NavLink
              href="/admin/terminals"
              icon={<Terminal className="h-3.5 w-3.5" />}
            >
              Terminals
            </NavLink>
            <NavLink
              href="/admin/activity"
              icon={<Activity className="h-3.5 w-3.5" />}
            >
              Activity
            </NavLink>
            <NavLink
              href="/admin/revocations"
              icon={<Ban className="h-3.5 w-3.5" />}
            >
              Revocations
            </NavLink>
            <NavLink
              href="/admin/infected"
              icon={<ShieldAlert className="h-3.5 w-3.5" />}
            >
              Infected files
            </NavLink>
          </nav>
        </aside>
        <main className="flex-1 overflow-x-auto p-6">{children}</main>
      </div>
    </div>
  );
}

function NavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-text-2 hover:bg-bg-2 hover:text-text-0"
    >
      <span className="text-text-3">{icon}</span>
      {children}
    </Link>
  );
}
