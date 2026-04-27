import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  Calendar,
  Activity,
  User,
  Palette,
  Bell,
  Keyboard,
  PartyPopper,
  Key,
  ShieldCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/TopBar";

/**
 * Account + settings landing. Lists every settings subsection so users can
 * reach profile/appearance/notifications/tokens/calendars/events/help from
 * one place. The rows render as a single divided card so nothing looks
 * "coming soon" — every link is live.
 */
export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_platform_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  const isPlatformAdmin = Boolean(
    (profile as { is_platform_admin?: boolean } | null)?.is_platform_admin,
  );

  return (
    <div className="flex min-h-screen flex-col bg-bg-0">
      <TopBar>
        <Link href="/" className="text-text-3 hover:text-text-1">
          ← Dashboard
        </Link>
        <span className="text-text-3">·</span>
        <span className="text-text-0">Settings</span>
      </TopBar>
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-3xl flex-1 p-6 focus:outline-none"
      >
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-bg-2 text-sm font-semibold text-text-0">
            {(user.email ?? "").slice(0, 2).toUpperCase()}
          </span>
          <div>
            <h1 className="text-lg font-semibold text-text-0">{user.email}</h1>
            <p className="text-xs text-text-3">
              Signed in
              {isPlatformAdmin ? " · platform admin" : ""}
            </p>
          </div>
        </div>

        <Group title="Account">
          <Row
            href="/settings/profile"
            icon={<User className="h-3.5 w-3.5 text-accent" />}
            title="Profile"
            subtitle="Name, avatar, timezone."
          />
          <Row
            href="/settings/appearance"
            icon={<Palette className="h-3.5 w-3.5 text-accent" />}
            title="Appearance"
            subtitle="Density and display preferences."
          />
          <Row
            href="/settings/notifications"
            icon={<Bell className="h-3.5 w-3.5 text-accent" />}
            title="Notifications"
            subtitle="Digest cadence, quiet hours, per-kind routing."
          />
        </Group>

        <Group title="Integrations">
          <Row
            href="/settings/tokens"
            icon={<Sparkles className="h-3.5 w-3.5 text-accent" />}
            title="API tokens"
            subtitle="Access tokens for Claude Desktop and other MCP clients."
          />
          <Row
            href="/settings/keys"
            icon={<Key className="h-3.5 w-3.5 text-accent" />}
            title="Provider keys (BYOK)"
            subtitle="Your own OpenAI, Anthropic, Google keys — encrypted at rest."
          />
          <Row
            href="/settings/calendars"
            icon={<Calendar className="h-3.5 w-3.5 text-accent" />}
            title="Calendars"
            subtitle="Connect Google Calendar and Outlook — events feed This Week."
          />
          <Row
            href="/approvals"
            icon={<ShieldCheck className="h-3.5 w-3.5 text-accent" />}
            title="Approvals"
            subtitle="Review tool runs awaiting your yes / no."
          />
        </Group>

        <Group title="Support">
          <Row
            href="/help"
            icon={<Keyboard className="h-3.5 w-3.5 text-accent" />}
            title="Help & shortcuts"
            subtitle="Full keyboard reference, concepts primer, support contact."
          />
          <Row
            href="/welcome"
            icon={<PartyPopper className="h-3.5 w-3.5 text-accent" />}
            title="Welcome tour"
            subtitle="The first-run checklist — revisit to finish setup."
          />
        </Group>

        {isPlatformAdmin ? (
          <Group title="Platform admin">
            <Row
              href="/settings/events"
              icon={<Activity className="h-3.5 w-3.5 text-accent" />}
              title="Domain events"
              subtitle="Append-only log of every state transition — for audit and webhooks."
            />
          </Group>
        ) : null}
      </main>
    </div>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5">
      <h2 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-3">
        {title}
      </h2>
      <ul className="divide-y divide-border rounded border border-border bg-bg-1 text-sm">
        {children}
      </ul>
    </section>
  );
}

function Row({
  href,
  icon,
  title,
  subtitle,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 px-4 py-3 hover:bg-bg-2"
      >
        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center">
          {icon}
        </span>
        <span className="flex-1">
          <span className="block text-text-0">{title}</span>
          <span className="block text-xs text-text-3">{subtitle}</span>
        </span>
        <span className="text-text-3" aria-hidden="true">
          ›
        </span>
      </Link>
    </li>
  );
}
