import { redirect } from "next/navigation";
import Link from "next/link";
import { CalendarOff, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/TopBar";
import { providerConfig } from "@/lib/calendar-oauth";
import {
  AdminBadge,
  AdminPanel,
  AdminSectionHeader,
} from "@/components/admin/primitives";
import { DisconnectButton } from "./DisconnectButton";
import { ConnectButton } from "./ConnectButton";
import { SyncNowButton } from "./SyncNowButton";
import { Banner } from "./Banner";
import { ProviderLogo } from "./ProviderLogo";

interface Props {
  searchParams: Promise<{ connected?: string; error?: string; provider?: string }>;
}

const PROVIDERS: Array<{ id: "google" | "microsoft"; label: string; subtitle: string }> = [
  { id: "google", label: "Google Calendar", subtitle: "Google Workspace" },
  { id: "microsoft", label: "Outlook / Microsoft 365", subtitle: "Microsoft 365" },
];

export default async function CalendarsPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Pull connections + per-connection live event counts in parallel.
  // Counting events per connection is ~one extra round-trip and lets the
  // row carry "23 events" so users can confirm the sync is producing data.
  const { data: rows } = await supabase
    .from("calendar_connections")
    .select(
      "id, provider, account_email, last_sync_at, last_sync_error, revoked_at, created_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  type Row = {
    id: string;
    provider: "google" | "microsoft";
    account_email: string;
    last_sync_at: string | null;
    last_sync_error: string | null;
    revoked_at: string | null;
    created_at: string;
  };
  const connections = (rows ?? []) as Row[];
  const active = connections.filter((c) => !c.revoked_at);

  // RLS-scoped event counts per active connection. `head: true` makes
  // these count-only queries with no row payload.
  const eventCounts = new Map<string, number>();
  if (active.length > 0) {
    const counts = await Promise.all(
      active.map((c) =>
        supabase
          .from("calendar_events")
          .select("id", { count: "exact", head: true })
          .eq("connection_id", c.id)
          .is("deleted_at", null),
      ),
    );
    active.forEach((c, i) => eventCounts.set(c.id, counts[i].count ?? 0));
  }

  const available = PROVIDERS.filter((p) => providerConfig(p.id) !== null);
  const unavailable = PROVIDERS.filter((p) => providerConfig(p.id) === null);
  const connectedProviders = new Set(active.map((c) => c.provider));
  const isProd = process.env.NODE_ENV === "production";

  return (
    <div className="flex min-h-screen flex-col bg-bg-0">
      <TopBar>
        <Link
          href="/settings"
          className="text-text-3 hover:text-text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus rounded-sm"
        >
          ← Settings
        </Link>
        <span className="text-text-3">·</span>
        <span className="text-text-0">Calendars</span>
      </TopBar>
      <main className="mx-auto w-full max-w-3xl flex-1 p-6">
        <AdminSectionHeader
          title="Connected calendars"
          description="Read-only mirror — Rokki never creates or modifies events in the source calendar. Background sync runs every ~15 minutes."
        />

        {params.connected ? (
          <Banner
            variant="success"
            message={`Connected ${labelFor(params.connected)} successfully.`}
          />
        ) : null}
        {params.error ? (
          <Banner
            variant="danger"
            message={errorMessage(params.error, params.provider)}
          />
        ) : null}

        {/* Connections panel */}
        <AdminPanel
          title={`Active${active.length > 0 ? ` · ${active.length}` : ""}`}
          className="mb-4"
        >
          {active.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-8 text-center text-xs text-text-3">
              <CalendarOff
                className="h-5 w-5 text-text-3"
                aria-hidden="true"
              />
              <p>
                {available.length > 0
                  ? "No calendars connected yet — pick a provider below to mirror your events into the week view."
                  : "Calendar OAuth isn't configured for this deployment yet."}
              </p>
              {available.length > 0 ? (
                <div className="flex flex-wrap justify-center gap-2">
                  {available.map((p) => (
                    <ConnectButton
                      key={p.id}
                      provider={p.id}
                      label={p.label}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {active.map((c) => {
                const eventCount = eventCounts.get(c.id) ?? 0;
                return (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center gap-3 px-4 py-2.5"
                  >
                    <ProviderLogo
                      provider={c.provider}
                      size={18}
                      className="flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span
                          className="truncate text-text-0"
                          title={c.account_email}
                        >
                          {c.account_email}
                        </span>
                        <span className="font-mono text-[9px] uppercase tracking-wide text-text-3">
                          {PROVIDERS.find((p) => p.id === c.provider)?.subtitle}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-text-3">
                        <SyncStatus
                          lastSyncAt={c.last_sync_at}
                          lastSyncError={c.last_sync_error}
                        />
                        <span className="text-text-3">·</span>
                        <span className="font-mono">
                          {eventCount} event{eventCount === 1 ? "" : "s"}
                        </span>
                        <span className="text-text-3">·</span>
                        <AdminBadge variant="muted">READ ONLY</AdminBadge>
                      </div>
                    </div>
                    <SyncNowButton />
                    <DisconnectButton id={c.id} />
                  </li>
                );
              })}
            </ul>
          )}
        </AdminPanel>

        {/* Add-calendar panel — only shown when there's at least one
            provider not already connected, otherwise it's just noise. */}
        {available.some((p) => !connectedProviders.has(p.id)) ||
        unavailable.length > 0 ? (
          <AdminPanel title="Add calendar" className="mb-4">
            <ul className="divide-y divide-border text-sm">
              {available
                .filter((p) => !connectedProviders.has(p.id))
                .map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-3 px-4 py-2.5"
                  >
                    <ProviderLogo
                      provider={p.id}
                      size={18}
                      className="flex-shrink-0"
                    />
                    <span className="flex-1 text-text-1">{p.label}</span>
                    <ConnectButton provider={p.id} label={p.label} />
                  </li>
                ))}
              {available
                .filter((p) => connectedProviders.has(p.id))
                .map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-3 px-4 py-2.5 text-text-3"
                  >
                    <ProviderLogo
                      provider={p.id}
                      size={18}
                      className="flex-shrink-0 opacity-50"
                    />
                    <span className="flex-1">{p.label}</span>
                    <AdminBadge variant="success">CONNECTED</AdminBadge>
                  </li>
                ))}
              {unavailable.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 px-4 py-2.5 text-text-3"
                >
                  <ProviderLogo
                    provider={p.id}
                    size={18}
                    className="flex-shrink-0 opacity-50"
                  />
                  <span className="flex-1">{p.label}</span>
                  <AdminBadge variant="muted">NOT CONFIGURED</AdminBadge>
                </li>
              ))}
            </ul>
          </AdminPanel>
        ) : null}

        {/* "Setup:" footer — useful for self-hosters in dev, noise in
            prod. In prod, instruct the user to ask their admin instead
            of pointing at a file path they can't edit. */}
        {unavailable.length > 0 ? (
          <p className="text-[11px] text-text-3">
            <strong className="text-text-2">Setup:</strong>{" "}
            {isProd
              ? `Ask your Rokki administrator to enable ${unavailable
                  .map((p) => p.label)
                  .join(" and ")}.`
              : `set the OAuth client env vars in the web app (see `}
            {isProd ? null : (
              <>
                <code className="rounded-sm bg-bg-2 px-1 font-mono">
                  apps/web/.env.example
                </code>
                ).
              </>
            )}
          </p>
        ) : null}
      </main>
    </div>
  );
}

/**
 * Renders the per-connection sync status as a colored pill: success
 * (synced N ago), pending (queued), or error (with truncated reason).
 * Long error messages get a `title` attribute so the full text is
 * available without the row growing vertically.
 */
function SyncStatus({
  lastSyncAt,
  lastSyncError,
}: {
  lastSyncAt: string | null;
  lastSyncError: string | null;
}) {
  if (lastSyncError) {
    return (
      <span
        className="inline-flex items-center gap-1 text-danger"
        title={lastSyncError}
      >
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
        <span className="max-w-[20ch] truncate font-mono">
          {lastSyncError}
        </span>
      </span>
    );
  }
  if (!lastSyncAt) {
    return <AdminBadge variant="warning">QUEUED</AdminBadge>;
  }
  const iso = lastSyncAt;
  return (
    <span title={iso}>
      <AdminBadge variant="success">SYNCED {formatRelative(iso)}</AdminBadge>
    </span>
  );
}

function labelFor(providerId: string): string {
  if (providerId === "microsoft") return "Outlook / Microsoft 365";
  if (providerId === "google") return "Google Calendar";
  return providerId;
}

function errorMessage(code: string, provider?: string): string {
  if (code === "provider_not_configured")
    return `${provider ?? "This provider"} is not configured. Ask an admin to add the OAuth credentials.`;
  if (code === "bad_state")
    return "Auth state mismatch — please try again.";
  if (code === "token_exchange_failed")
    return "We couldn't exchange the auth code for tokens.";
  if (code === "save_failed") return "Saving the connection failed. Try again.";
  if (code === "missing_code") return "Auth flow returned without a code.";
  if (code === "unknown_provider") return "Unknown provider.";
  return `Connection failed: ${code}`;
}

/**
 * Format a past timestamp relative to now, with finer-grained labels
 * than the original "Xh ago" / "Xd ago" version. Within the last
 * minute: "just now". Within an hour: "Nm ago". Today (>= 1h): "3h
 * ago". Yesterday in this calendar day: "yesterday HH:MMam/pm".
 * Within the last week: weekday + time. Older: short date.
 */
function formatRelative(iso: string): string {
  const now = new Date();
  const then = new Date(iso);
  const ms = now.getTime() - then.getTime();
  if (ms < 60_000) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  // If still on the same calendar day — use Nh ago.
  if (
    h < 24 &&
    now.getDate() === then.getDate() &&
    now.getMonth() === then.getMonth() &&
    now.getFullYear() === then.getFullYear()
  ) {
    return `${h}h ago`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (
    yesterday.getDate() === then.getDate() &&
    yesterday.getMonth() === then.getMonth() &&
    yesterday.getFullYear() === then.getFullYear()
  ) {
    return `yesterday ${formatTime(then)}`;
  }
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days < 7) {
    return `${then.toLocaleDateString(undefined, { weekday: "short" })} ${formatTime(then)}`;
  }
  return then.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatTime(d: Date): string {
  return d
    .toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    .toLowerCase()
    .replace(/\s/g, "");
}
