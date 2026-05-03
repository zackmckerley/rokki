"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { ArrowLeft, RotateCcw, AlertTriangle, Mail } from "lucide-react";
import { Wordmark } from "@/components/Wordmark";

/**
 * App Router runtime error boundary. Catches anything thrown out of a route
 * (server or client) below the root layout. Reports to Sentry on mount and
 * shows the digest so the user can quote it in a bug report.
 *
 * Deliberately does NOT show the raw stack — that's leaking implementation
 * detail to the user. The digest is enough for Sentry / Axiom lookup.
 *
 * `global-error.tsx` handles the case where the root layout itself fails;
 * we only need to handle the per-route case here.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
    // Server-side log so we can see the actual error message + stack
    // remotely — Sentry covers this in theory, but having a parallel
    // sink decoupled from Sentry config makes the next "what threw"
    // debugging session a single SQL query.
    try {
      void fetch("/api/v1/health/error-log", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: typeof window !== "undefined" ? window.location.href : null,
          digest: error.digest ?? null,
          message: error.message ?? null,
          stack: error.stack?.split("\n").slice(0, 20).join("\n") ?? null,
        }),
        keepalive: true,
      });
    } catch {
      /* ignore */
    }
  }, [error]);

  const digest = error.digest ?? "—";
  const reportSubject = encodeURIComponent(
    `Rokki error — ${digest === "—" ? "no digest" : digest}`,
  );
  const reportBody = encodeURIComponent(
    `Something broke in Rokki.\n\nError ID: ${digest}\nWhen: ${new Date().toISOString()}\n\nWhat I was trying to do:\n`,
  );

  return (
    <div className="flex min-h-screen flex-col bg-bg-0">
      <header className="flex h-11 flex-shrink-0 items-center border-b border-border bg-bg-1 px-4">
        {/* Plain anchor (not next/link) so this navigation is not
            intercepted by the broken router that put us on the error
            page in the first place. Hard browser navigation always
            works as a last-resort escape hatch. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/"
          className="flex items-center gap-3 rounded px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          aria-label="Rokki home"
        >
          <Wordmark size="md" />
        </a>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <section
          className="w-full max-w-lg rounded border border-border bg-bg-1"
          aria-labelledby="err-title"
        >
          <header className="flex items-center gap-2 border-b border-border bg-bg-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-danger">
            <AlertTriangle className="h-3 w-3" />
            HTTP 500 · runtime error
          </header>
          <div className="flex flex-col gap-5 p-6">
            <p
              className="font-mono text-5xl font-semibold text-accent"
              aria-hidden="true"
            >
              500
            </p>
            <div>
              <h1 id="err-title" className="text-xl font-semibold text-text-0">
                Something broke. We&apos;ve logged it.
              </h1>
              <p className="mt-1 text-sm text-text-2">
                Try the action again. If it keeps failing, send us the error ID
                below and we&apos;ll trace it.
              </p>
              <p className="mt-3 break-all rounded-sm border border-border bg-bg-0 px-2 py-1 font-mono text-[11px] text-text-3">
                <span className="text-text-2">id</span>{" "}
                <span className="text-accent">{digest}</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => reset()}
                className="inline-flex items-center gap-1.5 rounded-sm border border-accent bg-accent-subtle px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-accent hover:bg-accent/20"
              >
                <RotateCcw className="h-3 w-3" /> Try again
              </button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/"
                className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-bg-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-text-1 hover:bg-bg-3"
              >
                <ArrowLeft className="h-3 w-3" /> Back to dashboard
              </a>
            </div>
          </div>
          <footer className="border-t border-border px-4 py-2 text-[11px] text-text-3">
            <a
              href={`mailto:support@rokki.ai?subject=${reportSubject}&body=${reportBody}`}
              className="inline-flex items-center gap-1 hover:text-text-1"
            >
              <Mail className="h-3 w-3" /> Report with error ID
            </a>
          </footer>
        </section>
      </main>
    </div>
  );
}
