"use client";

import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Loader2,
  Link2,
  Unlink,
  Smartphone,
  ShieldCheck,
  AlertTriangle,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRealtimeTable } from "@/lib/supabase/realtime";
import {
  describeSignalStatus,
  toneTextClass,
  type SignalStatus,
} from "@/lib/signal/status";
import { SettingsCard, SettingRow } from "./settings-ui";

interface SignalAccount {
  status: SignalStatus;
  signal_number: string | null;
  linked_at: string | null;
  thread_count: number;
  configured: boolean;
}

/** Roughly 4 minutes of polling at 2.5s while a QR is on screen. */
const MAX_POLLS = 96;

/**
 * Connect Signal — the body of the Messages module settings page. Links the
 * user's own Signal account (as a secondary device) to Rokki so their
 * conversations sync into the Messages module and they can send from either
 * place. Talks only to our /api/v1/signal/* routes; the bridge secret never
 * reaches the browser.
 */
export function SignalConnection() {
  const [account, setAccount] = useState<SignalAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkUri, setLinkUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/v1/signal/account", {
        credentials: "include",
      });
      if (!r.ok) return;
      const body = (await r.json()) as { data?: SignalAccount };
      if (!body.data) return;
      setAccount(body.data);
      if (body.data.status === "active") {
        setLinkUri(null);
        setExpired(false);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep status + counts fresh: the bridge writes via the service role, and
  // RLS scopes these realtime events to the owner's own rows.
  useRealtimeTable<{ user_id: string }>(
    { table: "signal_accounts", channelKey: "signal:account" },
    { onInsert: () => void load(), onUpdate: () => void load() },
  );
  useRealtimeTable<{ id: string }>(
    { table: "signal_threads", channelKey: "signal:threads" },
    { onInsert: () => void load(), onUpdate: () => void load() },
  );

  // While a QR is on screen, poll for the link to complete (realtime is the
  // happy path; this is the safety net + it expires the QR after a while).
  useEffect(() => {
    if (!linkUri) return;
    let attempts = 0;
    const t = setInterval(() => {
      attempts += 1;
      if (attempts > MAX_POLLS) {
        setLinkUri(null);
        setExpired(true);
        clearInterval(t);
        return;
      }
      void load();
    }, 2500);
    return () => clearInterval(t);
  }, [linkUri, load]);

  const connect = useCallback(async () => {
    setBusy(true);
    setError(null);
    setExpired(false);
    try {
      const r = await fetch("/api/v1/signal/link", {
        method: "POST",
        credentials: "include",
      });
      const body = (await r.json().catch(() => ({}))) as {
        data?: { uri: string };
        errors?: { message: string }[];
      };
      if (!r.ok || !body.data?.uri) {
        setError(body.errors?.[0]?.message ?? "Couldn't start linking.");
        return;
      }
      setLinkUri(body.data.uri);
      void load();
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }, [load]);

  const disconnect = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await fetch("/api/v1/signal/account", {
        method: "DELETE",
        credentials: "include",
      });
      setLinkUri(null);
      await load();
    } finally {
      setBusy(false);
    }
  }, [load]);

  if (loading && !account) {
    return (
      <SettingsCard title="Signal">
        <p className="px-4 py-6 text-center text-xs text-text-3">Loading…</p>
      </SettingsCard>
    );
  }

  if (account && !account.configured) {
    return (
      <SettingsCard title="Signal" description="Send and receive Signal messages from Rokki.">
        <div className="flex items-start gap-3 px-4 py-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" aria-hidden="true" />
          <div className="text-xs text-text-2">
            <p className="text-text-1">Signal isn’t set up on this workspace yet.</p>
            <p className="mt-1 text-text-3">
              An admin needs to configure the Signal bridge
              (<code className="font-mono text-2xs">SIGNAL_BRIDGE_URL</code> and{" "}
              <code className="font-mono text-2xs">SIGNAL_BRIDGE_SECRET</code>) before
              accounts can be linked.
            </p>
          </div>
        </div>
      </SettingsCard>
    );
  }

  const view = describeSignalStatus(account?.status);

  return (
    <div className="flex flex-col gap-4">
      <SettingsCard
        title="Signal"
        description="Link your own Signal account to send and receive messages from Rokki or your phone — they stay in sync."
        meta={
          <span className="inline-flex items-center gap-1.5">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                view.connected ? "bg-success" : "bg-text-3",
              )}
              aria-hidden="true"
            />
            <span className={toneTextClass(view.tone)}>{view.label}</span>
          </span>
        }
      >
        {/* Connected */}
        {view.connected ? (
          <div className="divide-y divide-border">
            <SettingRow
              label={
                <span className="inline-flex items-center gap-2">
                  <Smartphone className="h-3.5 w-3.5 text-text-3" aria-hidden="true" />
                  {account?.signal_number ?? "Linked"}
                </span>
              }
              description={
                account?.linked_at
                  ? `Linked ${formatWhen(account.linked_at)}`
                  : "Linked as a secondary device."
              }
            >
              <button
                type="button"
                onClick={disconnect}
                disabled={busy}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-sm border border-border bg-bg-1 px-2.5 py-1.5",
                  "text-2xs font-semibold uppercase tracking-wide text-text-2",
                  "hover:bg-bg-2 hover:text-danger disabled:opacity-50",
                )}
              >
                {busy ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                ) : (
                  <Unlink className="h-3 w-3" aria-hidden="true" />
                )}
                Disconnect
              </button>
            </SettingRow>
            <SettingRow
              label={
                <span className="inline-flex items-center gap-2">
                  <MessageSquare className="h-3.5 w-3.5 text-text-3" aria-hidden="true" />
                  Synced conversations
                </span>
              }
              description="Your Signal chats appear in the Messages module."
            >
              <span className="font-mono text-xs text-text-1">
                {account?.thread_count ?? 0}
              </span>
            </SettingRow>
          </div>
        ) : linkUri ? (
          /* Linking — QR on screen */
          <div className="flex flex-col items-center gap-4 px-4 py-5">
            <div className="rounded-md bg-white p-3 shadow-sm">
              <QRCodeSVG value={linkUri} size={196} level="M" />
            </div>
            <ol className="w-full max-w-sm space-y-1.5 text-xs text-text-2">
              <Step n={1}>Open Signal on your phone.</Step>
              <Step n={2}>
                Go to <span className="text-text-1">Settings → Linked Devices → Link New Device</span>.
              </Step>
              <Step n={3}>Scan this code.</Step>
            </ol>
            <div className="flex items-center gap-2 text-2xs text-text-3">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              Waiting for you to scan…
            </div>
            <button
              type="button"
              onClick={() => setLinkUri(null)}
              className="text-2xs text-text-3 underline-offset-2 hover:text-text-1 hover:underline"
            >
              Cancel
            </button>
          </div>
        ) : (
          /* Not connected */
          <div className="flex flex-col gap-3 px-4 py-4">
            <p className="text-xs text-text-2">
              Rokki links to Signal as a secondary device — like Signal Desktop.
              Your phone stays the primary device, and nothing changes about how
              Signal works.
            </p>
            {expired ? (
              <p className="text-2xs text-warning">
                That link expired before it was scanned. Generate a new one.
              </p>
            ) : null}
            {error ? <p className="text-2xs text-danger">{error}</p> : null}
            <div>
              <button
                type="button"
                onClick={connect}
                disabled={busy}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-sm border border-accent bg-accent px-3 py-1.5",
                  "text-2xs font-semibold uppercase tracking-wide text-bg-0",
                  "hover:opacity-90 disabled:opacity-50",
                )}
              >
                {busy ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                ) : (
                  <Link2 className="h-3 w-3" aria-hidden="true" />
                )}
                Connect Signal
              </button>
            </div>
          </div>
        )}
      </SettingsCard>

      <SettingsCard title="Good to know">
        <div className="divide-y divide-border text-xs text-text-2">
          <Note icon={MessageSquare}>
            <span className="text-text-1">Messaging only.</span> Signal calls
            (audio/video) can’t be bridged — there’s no API for them. Meetings and
            A/V are a separate, Rokki-native feature.
          </Note>
          <Note icon={ShieldCheck}>
            <span className="text-text-1">Privacy.</span> To show your messages,
            the bridge decrypts them, so synced chats are readable on Rokki’s
            server while linked — inherent to any Signal bridge. Disappearing-message
            timers are honored.
          </Note>
          <Note icon={Smartphone}>
            <span className="text-text-1">Your phone stays in charge.</span>{" "}
            Unlink anytime from Signal → Settings → Linked Devices, or with
            Disconnect above.
          </Note>
        </div>
      </SettingsCard>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-px flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border border-border font-mono text-[9px] text-text-3">
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}

function Note({
  icon: Icon,
  children,
}: {
  icon: typeof MessageSquare;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 px-4 py-2.5">
      <Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-text-3" aria-hidden="true" />
      <p className="leading-snug text-text-3">{children}</p>
    </div>
  );
}

function formatWhen(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
