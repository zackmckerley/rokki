import { redirect } from "next/navigation";
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
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/TopBar";
import { AccountBlock } from "@/components/AccountBlock";
import { AdminBackLink } from "./AdminBackLink";
import { AdminNavLink } from "./AdminNavLink";

/**
 * Platform admin shell.
 *
 *   - Gates every /admin/* route on `is_platform_admin = true`
 *   - Sidebar lists every admin section. Vercel-style: w-60, generous
 *     padding, active-route highlighted, AccountBlock pinned to bottom
 *     so admins can switch identities or sign out without leaving /admin
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
    redirect("/forbidden?reason=admin_only&from=/admin");
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
        <aside className="sticky top-0 hidden w-60 flex-shrink-0 flex-col border-r border-border bg-bg-1 md:flex">
          <nav
            aria-label="Admin sections"
            className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4"
          >
            <NavGroup label="Operations">
              <AdminNavLink
                href="/admin"
                exact
                icon={<Gauge className="h-4 w-4" />}
              >
                Overview
              </AdminNavLink>
            </NavGroup>
            <NavGroup label="Tenancy">
              <AdminNavLink
                href="/admin/users"
                icon={<Users className="h-4 w-4" />}
              >
                Users
              </AdminNavLink>
              <AdminNavLink
                href="/admin/spaces"
                icon={<Building2 className="h-4 w-4" />}
              >
                Spaces
              </AdminNavLink>
              <AdminNavLink
                href="/admin/terminals"
                icon={<Terminal className="h-4 w-4" />}
              >
                Terminals
              </AdminNavLink>
            </NavGroup>
            <NavGroup label="Marketplace">
              <AdminNavLink
                href="/admin/tools"
                icon={<Wrench className="h-4 w-4" />}
              >
                Tools
              </AdminNavLink>
              <AdminNavLink
                href="/admin/quotas"
                icon={<GaugeMeter className="h-4 w-4" />}
              >
                Quotas
              </AdminNavLink>
              <AdminNavLink
                href="/approvals"
                icon={<ShieldCheck className="h-4 w-4" />}
              >
                Approvals
              </AdminNavLink>
            </NavGroup>
            <NavGroup label="Security">
              <AdminNavLink
                href="/admin/tokens"
                icon={<KeyRound className="h-4 w-4" />}
              >
                Tokens
              </AdminNavLink>
              <AdminNavLink
                href="/admin/rate-limits"
                icon={<AlertOctagon className="h-4 w-4" />}
              >
                Rate limits
              </AdminNavLink>
              <AdminNavLink
                href="/admin/failed-logins"
                icon={<XCircle className="h-4 w-4" />}
              >
                Failed logins
              </AdminNavLink>
              <AdminNavLink
                href="/admin/emergency"
                icon={<ShieldAlert className="h-4 w-4" />}
              >
                Emergency access
              </AdminNavLink>
            </NavGroup>
            <NavGroup label="Audit">
              <AdminNavLink
                href="/admin/activity"
                icon={<Activity className="h-4 w-4" />}
              >
                Activity
              </AdminNavLink>
              <AdminNavLink
                href="/admin/revocations"
                icon={<Ban className="h-4 w-4" />}
              >
                Revocations
              </AdminNavLink>
              <AdminNavLink
                href="/admin/infected"
                icon={<ShieldAlert className="h-4 w-4" />}
              >
                Infected files
              </AdminNavLink>
              <AdminNavLink
                href="/admin/trash"
                icon={<Trash2 className="h-4 w-4" />}
              >
                Trash
              </AdminNavLink>
              <AdminNavLink
                href="/api/v1/admin/export/audit?since_days=30"
                icon={<Download className="h-4 w-4" />}
              >
                Export audit
              </AdminNavLink>
            </NavGroup>
            <NavGroup label="Platform">
              <AdminNavLink
                href="/admin/announcements"
                icon={<Megaphone className="h-4 w-4" />}
              >
                Announcements
              </AdminNavLink>
              <AdminNavLink
                href="/admin/flags"
                icon={<ToggleLeft className="h-4 w-4" />}
              >
                Feature flags
              </AdminNavLink>
              <AdminNavLink
                href="/admin/storage"
                icon={<HardDrive className="h-4 w-4" />}
              >
                Storage
              </AdminNavLink>
              <AdminNavLink
                href="/admin/health"
                icon={<HeartPulse className="h-4 w-4" />}
              >
                Health
              </AdminNavLink>
              <AdminNavLink
                href="/admin/webhooks"
                icon={<Send className="h-4 w-4" />}
              >
                Webhooks
              </AdminNavLink>
              <AdminNavLink
                href="/admin/legal"
                icon={<Palette className="h-4 w-4" />}
              >
                Legal & branding
              </AdminNavLink>
            </NavGroup>
          </nav>
          <AccountBlock
            name={accountName}
            email={accountEmail}
            isPlatformAdmin
          />
        </aside>
        <main className="flex-1 overflow-x-auto p-6">{children}</main>
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
    <div className="mb-4">
      <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-3">
        {label}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}
