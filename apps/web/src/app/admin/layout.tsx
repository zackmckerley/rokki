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
  ShieldCheck,
  Wrench,
  Gauge as GaugeMeter,
  KeyRound,
  AlertOctagon,
  XCircle,
  Download,
  Megaphone,
  ToggleLeft,
  HardDrive,
  HeartPulse,
  Send,
  Palette,
  ListChecks,
  Plug,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/TopBar";
import { AccountBlock } from "@/components/AccountBlock";
import { AdminBackLink } from "./AdminBackLink";

/**
 * Platform admin shell.
 *
 *   - Gates every /admin/* route on `is_platform_admin = true`
 *   - Sidebar lists every admin section, with the AccountBlock pinned
 *     to the bottom so admins can switch identities or sign out without
 *     leaving /admin
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
    .select("full_name, is_platform_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  const typedProfile = profile as
    | { full_name?: string | null; is_platform_admin?: boolean }
    | null;

  if (!typedProfile?.is_platform_admin) {
    redirect("/?error=admin_only");
  }

  const accountName = typedProfile.full_name?.trim() || user.email || "Admin";
  const accountEmail = user.email ?? "";

  return (
    <div className="flex min-h-screen flex-col bg-bg-0">
      <TopBar>
        <AdminBackLink />
        <span className="font-mono text-xs uppercase tracking-wider text-accent">
          Platform admin
        </span>
      </TopBar>
      <div className="mx-auto flex w-full max-w-7xl flex-1">
        <aside className="sticky top-0 hidden w-52 flex-shrink-0 flex-col border-r border-border bg-bg-1 md:flex">
          <nav
            aria-label="Admin sections"
            className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2 text-sm"
          >
            <NavGroup label="Operations">
              <NavLink href="/admin" icon={<Gauge className="h-3.5 w-3.5" />}>
                Overview
              </NavLink>
              <NavLink
                href="/admin/jobs"
                icon={<ListChecks className="h-3.5 w-3.5" />}
              >
                Jobs
              </NavLink>
              <NavLink
                href="/admin/mcp"
                icon={<Plug className="h-3.5 w-3.5" />}
              >
                MCP parity
              </NavLink>
            </NavGroup>
            <NavGroup label="Tenancy">
              <NavLink
                href="/admin/users"
                icon={<Users className="h-3.5 w-3.5" />}
              >
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
            </NavGroup>
            <NavGroup label="Marketplace">
              <NavLink
                href="/admin/tools"
                icon={<Wrench className="h-3.5 w-3.5" />}
              >
                Tools
              </NavLink>
              <NavLink
                href="/admin/quotas"
                icon={<GaugeMeter className="h-3.5 w-3.5" />}
              >
                Quotas
              </NavLink>
              <NavLink
                href="/approvals"
                icon={<ShieldCheck className="h-3.5 w-3.5" />}
              >
                Approvals
              </NavLink>
            </NavGroup>
            <NavGroup label="Security">
              <NavLink
                href="/admin/tokens"
                icon={<KeyRound className="h-3.5 w-3.5" />}
              >
                Tokens
              </NavLink>
              <NavLink
                href="/admin/rate-limits"
                icon={<AlertOctagon className="h-3.5 w-3.5" />}
              >
                Rate limits
              </NavLink>
              <NavLink
                href="/admin/failed-logins"
                icon={<XCircle className="h-3.5 w-3.5" />}
              >
                Failed logins
              </NavLink>
              <NavLink
                href="/admin/emergency"
                icon={<ShieldAlert className="h-3.5 w-3.5" />}
              >
                Emergency access
              </NavLink>
            </NavGroup>
            <NavGroup label="Audit">
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
              <NavLink
                href="/api/v1/admin/export/audit?since_days=30"
                icon={<Download className="h-3.5 w-3.5" />}
              >
                Export audit
              </NavLink>
            </NavGroup>
            <NavGroup label="Platform">
              <NavLink
                href="/admin/announcements"
                icon={<Megaphone className="h-3.5 w-3.5" />}
              >
                Announcements
              </NavLink>
              <NavLink
                href="/admin/flags"
                icon={<ToggleLeft className="h-3.5 w-3.5" />}
              >
                Feature flags
              </NavLink>
              <NavLink
                href="/admin/storage"
                icon={<HardDrive className="h-3.5 w-3.5" />}
              >
                Storage
              </NavLink>
              <NavLink
                href="/admin/health"
                icon={<HeartPulse className="h-3.5 w-3.5" />}
              >
                Health
              </NavLink>
              <NavLink
                href="/admin/webhooks"
                icon={<Send className="h-3.5 w-3.5" />}
              >
                Webhooks
              </NavLink>
              <NavLink
                href="/admin/legal"
                icon={<Palette className="h-3.5 w-3.5" />}
              >
                Legal & branding
              </NavLink>
            </NavGroup>
          </nav>
          <AccountBlock
            name={accountName}
            email={accountEmail}
            isPlatformAdmin
          />
        </aside>
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 overflow-x-auto p-6 focus:outline-none"
        >
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
