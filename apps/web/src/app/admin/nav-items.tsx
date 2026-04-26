import {
  Gauge,
  Users,
  Building2,
  Terminal,
  Activity,
  ShieldAlert,
  Ban,
  Mail,
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
} from "lucide-react";
import type { ReactNode } from "react";

/**
 * Single source of truth for admin sidebar links.
 *
 * Both the desktop sticky sidebar (rendered in `layout.tsx`) and the
 * mobile drawer (`AdminMobileNav.tsx`) iterate this array, so adding a
 * section here lights up both surfaces.
 *
 * Groups render as a labeled cluster; items inside a group share an
 * eyebrow heading. `exact` items must match the pathname exactly to be
 * considered "current" — needed for `/admin` itself, where any deeper
 * route would otherwise also light it up.
 */
export interface AdminNavItem {
  label: string;
  href: string;
  icon: ReactNode;
  group: string;
  exact?: boolean;
}

export const ADMIN_NAV_GROUPS: ReadonlyArray<string> = [
  "Operations",
  "Tenancy",
  "Marketplace",
  "Security",
  "Audit",
  "Platform",
];

export const ADMIN_NAV_ITEMS: ReadonlyArray<AdminNavItem> = [
  // Operations
  {
    label: "Overview",
    href: "/admin",
    icon: <Gauge className="h-3.5 w-3.5" />,
    group: "Operations",
    exact: true,
  },

  // Tenancy
  {
    label: "Users",
    href: "/admin/users",
    icon: <Users className="h-3.5 w-3.5" />,
    group: "Tenancy",
  },
  {
    label: "Spaces",
    href: "/admin/spaces",
    icon: <Building2 className="h-3.5 w-3.5" />,
    group: "Tenancy",
  },
  {
    label: "Terminals",
    href: "/admin/terminals",
    icon: <Terminal className="h-3.5 w-3.5" />,
    group: "Tenancy",
  },
  {
    label: "Invitations",
    href: "/admin/invitations",
    icon: <Mail className="h-3.5 w-3.5" />,
    group: "Tenancy",
  },

  // Marketplace
  {
    label: "Tools",
    href: "/admin/tools",
    icon: <Wrench className="h-3.5 w-3.5" />,
    group: "Marketplace",
  },
  {
    label: "Quotas",
    href: "/admin/quotas",
    icon: <GaugeMeter className="h-3.5 w-3.5" />,
    group: "Marketplace",
  },
  {
    label: "Approvals",
    href: "/approvals",
    icon: <ShieldCheck className="h-3.5 w-3.5" />,
    group: "Marketplace",
  },

  // Security
  {
    label: "Tokens",
    href: "/admin/tokens",
    icon: <KeyRound className="h-3.5 w-3.5" />,
    group: "Security",
  },
  {
    label: "Rate limits",
    href: "/admin/rate-limits",
    icon: <AlertOctagon className="h-3.5 w-3.5" />,
    group: "Security",
  },
  {
    label: "Failed logins",
    href: "/admin/failed-logins",
    icon: <XCircle className="h-3.5 w-3.5" />,
    group: "Security",
  },
  {
    label: "Emergency access",
    href: "/admin/emergency",
    icon: <ShieldAlert className="h-3.5 w-3.5" />,
    group: "Security",
  },

  // Audit
  {
    label: "Activity",
    href: "/admin/activity",
    icon: <Activity className="h-3.5 w-3.5" />,
    group: "Audit",
  },
  {
    label: "Revocations",
    href: "/admin/revocations",
    icon: <Ban className="h-3.5 w-3.5" />,
    group: "Audit",
  },
  {
    label: "Infected files",
    href: "/admin/infected",
    icon: <ShieldAlert className="h-3.5 w-3.5" />,
    group: "Audit",
  },
  {
    label: "Export audit",
    href: "/api/v1/admin/export/audit?since_days=30",
    icon: <Download className="h-3.5 w-3.5" />,
    group: "Audit",
  },

  // Platform
  {
    label: "Announcements",
    href: "/admin/announcements",
    icon: <Megaphone className="h-3.5 w-3.5" />,
    group: "Platform",
  },
  {
    label: "Feature flags",
    href: "/admin/flags",
    icon: <ToggleLeft className="h-3.5 w-3.5" />,
    group: "Platform",
  },
  {
    label: "Storage",
    href: "/admin/storage",
    icon: <HardDrive className="h-3.5 w-3.5" />,
    group: "Platform",
  },
  {
    label: "Health",
    href: "/admin/health",
    icon: <HeartPulse className="h-3.5 w-3.5" />,
    group: "Platform",
  },
  {
    label: "Webhooks",
    href: "/admin/webhooks",
    icon: <Send className="h-3.5 w-3.5" />,
    group: "Platform",
  },
  {
    label: "Legal & branding",
    href: "/admin/legal",
    icon: <Palette className="h-3.5 w-3.5" />,
    group: "Platform",
  },
];
