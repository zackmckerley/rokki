"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { ProviderLogo } from "./ProviderLogo";

/**
 * Connect button — kicks off the OAuth dance for a provider.
 *
 * Implemented as a client form (not a <Link>) because:
 *   1. The server endpoint at /api/v1/calendar/connect/:provider mints
 *      a state cookie and redirects. Going through a <Link prefetch>
 *      would consume the cookie on hover, leaving a stale state for
 *      the real click → bad_state on OAuth callback.
 *   2. We want to disable the button after the first click so a
 *      double-click can't burn two state cookies in a row.
 *   3. We surface a "Redirecting…" pending state for slow networks,
 *      since browser tabs can show no progress between click and the
 *      provider redirect.
 */
export function ConnectButton({
  provider,
  label,
}: {
  provider: "google" | "microsoft";
  label: string;
}) {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        setPending(true);
        window.location.href = `/api/v1/calendar/connect/${provider}`;
      }}
      className="inline-flex items-center gap-1.5 rounded-sm border border-accent bg-accent-subtle px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-accent hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
      ) : (
        <ProviderLogo provider={provider} size={12} />
      )}
      {pending ? "Redirecting…" : `Connect ${label}`}
    </button>
  );
}
