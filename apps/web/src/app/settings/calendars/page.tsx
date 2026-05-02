import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Calendar,
  AlertTriangle,
  CheckCircle2,
  CalendarOff,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/TopBar";
import { EmptyState } from "@/components/EmptyState";
import { providerConfig } from "@/lib/calendar-oauth";
import { DisconnectButton } from "./DisconnectButton";

interface Props {
  searchParams: Promise<{ connected?: string; error?: string; provider?: string }>;
}

export default async function CalendarsPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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

  const providers: Array<{ id: "google" | "microsoft"; label: string }> = [
    { id: "google", label: "Google Calendar" },
    { id: "microsoft", label: "Outlook / Microsoft 365" },
  ];
  const available = providers.filter((p) => providerConfig(p.id) !== null);
  const unavailable = providers.filter((p) => providerConfig(p.id) === null);

  return (
    <div className="flex min-h-screen flex-col bg-bg-0">
      <TopBar>
        <Link href="/settings" className="text-text-3 hover:text-text-1">
          ← Settings
        </Link>
        <span className="text-text-3">·</span>
        <span className="text-text-0">Calendars</span>
      </TopBar>
      <main className="mx-auto w-full max-w-3xl flex-1 p-6">
        <h1 className="mb-2 flex items-center gap-2 text-xl font-semibold text-text-0">
          <Calendar className="h-5 w-5 text-accent" />
          Connected calendars
        </h1>
        <p className="mb-6 text-xs text-text-3">
          Rokki syncs read-only. Nothing is created or modified in your
          provider&apos;s calendar. Syncs run every ~15 minutes.
        </p>

        {params.connected ? (
          <div className="mb-4 flex items-center gap-2 rounded border border-success-subtle bg-success-subtle px-3 py-2 text-xs text-success">
            <CheckCircle2 className="h-3 w-3" />
            Connected {params.connected} successfully.
          </div>
        ) : null}
        {params.error ? (
          <div className="mb-4 flex items-center gap-2 rounded border border-danger-subtle bg-danger-subtle px-3 py-2 text-xs text-danger">
            <AlertTriangle className="h-3 w-3" />
            {errorMessage(params.error, params.provider)}
          </div>
        ) : null}

        {active.length === 0 ? (
          <div className="mb-6 rounded border border-dashed border-border bg-bg-1">
            <EmptyState
              icon={CalendarOff}
              title="No calendars connected yet."
              body={
                available.length > 0
                  ? "Connect Google or Outlook below to mirror your events into Rokki's week view."
                  : "Calendar OAuth isn't configured for this deployment yet."
              }
              className="p-6"
            />
          </div>
        ) : (
          <ul className="mb-6 divide-y divide-border rounded border border-border bg-bg-1 text-sm">
            {active.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-3 px-4 py-3"
              >
                <span
                  className={`h-6 w-6 rounded-sm text-center text-xs font-semibold leading-6 ${
                    c.provider === "google"
                      ? "bg-info-subtle text-info"
                      : "bg-warning-subtle text-warning"
                  }`}
                >
                  {c.provider === "google" ? "G" : "O"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="truncate text-text-0">
                    {c.account_email}
                  </div>
                  <div className="text-xs text-text-3">
                    {c.last_sync_error
                      ? `sync failed: ${c.last_sync_error}`
                      : c.last_sync_at
                        ? `last synced ${formatRelative(c.last_sync_at)}`
                        : "awaiting first sync…"}
                  </div>
                </div>
                <DisconnectButton id={c.id} />
              </li>
            ))}
          </ul>
        )}

        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-3">
          Add calendar
        </h2>
        <ul className="divide-y divide-border rounded border border-border bg-bg-1 text-sm">
          {available.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3">
              <span className="flex-1 text-text-0">{p.label}</span>
              <Link
                href={`/api/v1/calendar/connect/${p.id}`}
                className="rounded-sm bg-accent px-3 py-1 text-xs text-bg-0 hover:opacity-90"
              >
                Connect
              </Link>
            </li>
          ))}
          {unavailable.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 px-4 py-3 text-text-3"
            >
              <span className="flex-1">{p.label}</span>
              <span className="rounded-sm bg-bg-2 px-2 py-1 text-[10px] uppercase tracking-wide">
                not configured
              </span>
            </li>
          ))}
        </ul>
        {unavailable.length > 0 ? (
          <div className="mt-4 rounded border border-border bg-bg-1 p-3 text-xs text-text-3">
            <strong className="text-text-1">Setup:</strong> to enable{" "}
            {unavailable.map((p) => p.label).join(" and ")}, set the OAuth
            client env vars in the web app (see <code>.env.example</code>).
          </div>
        ) : null}
      </main>
    </div>
  );
}

function errorMessage(code: string, provider?: string): string {
  if (code === "provider_not_configured")
    return `${provider ?? "This provider"} is not configured. Ask an admin to add the OAuth credentials.`;
  if (code === "bad_state") return "Auth state mismatch — please try again.";
  if (code === "token_exchange_failed")
    return "We couldn't exchange the auth code for tokens.";
  if (code === "save_failed") return "Sync saved failed. Try again.";
  return `Connection failed: ${code}`;
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
