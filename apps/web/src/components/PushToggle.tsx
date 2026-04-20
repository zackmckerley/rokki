"use client";

import { useEffect, useState } from "react";
import { BellOff, BellRing, AlertCircle } from "lucide-react";
import {
  isPushReady,
  getPushSubscription,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push-client";
import { cn } from "@/lib/utils";

/**
 * Inline toggle for web-push notifications. Safe to drop into the
 * notifications settings page — if the deployment hasn't configured
 * VAPID keys, the control renders a short explanation instead of a
 * broken button.
 */
export function PushToggle() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPushReady()) {
      setReady(false);
      return;
    }
    setReady(true);
    getPushSubscription()
      .then((sub) => setSubscribed(sub !== null))
      .catch(() => setSubscribed(false));
  }, []);

  if (ready === false) {
    return (
      <div className="flex items-start gap-2 rounded-sm border border-border bg-bg-2 px-3 py-2 text-xs text-text-3">
        <BellOff className="mt-0.5 h-3 w-3 flex-shrink-0" />
        Web push isn&apos;t configured on this deployment. Email digest still
        works.
      </div>
    );
  }

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      await subscribeToPush();
      setSubscribed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not enable");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      await unsubscribeFromPush();
      setSubscribed(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {subscribed ? (
        <BellRing className="h-4 w-4 text-accent" />
      ) : (
        <BellOff className="h-4 w-4 text-text-2" />
      )}
      <span className="flex-1">
        <span className="block text-sm text-text-0">Browser notifications</span>
        <span className="block text-xs text-text-3">
          {subscribed
            ? "Rokki can ping this browser when something needs you."
            : "Off — you&apos;ll see updates when the tab is open only."}
        </span>
      </span>
      <button
        type="button"
        onClick={() => void (subscribed ? disable() : enable())}
        disabled={busy || ready === null}
        className={cn(
          "rounded-sm border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide",
          subscribed
            ? "border-border bg-bg-2 text-text-1 hover:bg-bg-3"
            : "border-accent bg-accent-subtle text-accent hover:bg-accent/20",
          (busy || ready === null) && "cursor-not-allowed opacity-60",
        )}
      >
        {busy
          ? "Working…"
          : subscribed
            ? "Disable"
            : "Enable"}
      </button>
      {error ? (
        <span className="flex items-center gap-1 text-xs text-danger">
          <AlertCircle className="h-3 w-3" /> {error}
        </span>
      ) : null}
    </div>
  );
}
