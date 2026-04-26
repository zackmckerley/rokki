import Link from "next/link";
import { headers } from "next/headers";
import { ArrowLeft, Search, Mail } from "lucide-react";
import { Wordmark } from "@/components/Wordmark";

export const metadata = { title: "Not found — Rokki" };

/**
 * Next.js App Router 404. Bloomberg-styled: full-screen dark, mono "404" in
 * accent, dense single-card layout, two primary actions plus a "Report this"
 * mailto so a user can send the broken path with one click.
 *
 * Path is read from the `x-invoked-path` / `referer` headers when available
 * so the report email pre-fills the URL. Falls back gracefully when the
 * header isn't present (next/navigation doesn't expose the requested path
 * to a static 404 component).
 */
export default async function NotFound() {
  const h = await headers();
  // next-url is set by Next on the request; falls back to referer for
  // app-internal navigation events. Either gives us *some* context for the
  // report link without being so chatty that the email becomes useless.
  const path = h.get("x-invoked-path") ?? h.get("next-url") ?? h.get("referer") ?? "";
  const reportSubject = encodeURIComponent("Rokki 404 — broken link");
  const reportBody = encodeURIComponent(
    `I hit a 404 in Rokki.\n\nPath: ${path || "(unknown)"}\nWhen: ${new Date().toISOString()}\n\nWhat I was trying to do:\n`,
  );

  return (
    <div className="flex min-h-screen flex-col bg-bg-0">
      <header className="flex h-11 flex-shrink-0 items-center border-b border-border bg-bg-1 px-4">
        <Link
          href="/"
          className="flex items-center gap-3 rounded px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          aria-label="Rokki home"
        >
          <Wordmark size="md" />
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <section
          className="w-full max-w-lg rounded border border-border bg-bg-1"
          aria-labelledby="nf-title"
        >
          <header className="border-b border-border bg-bg-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-3">
            HTTP 404 · not found
          </header>
          <div className="flex flex-col gap-5 p-6">
            <p
              className="font-mono text-5xl font-semibold text-accent"
              aria-hidden="true"
            >
              404
            </p>
            <div>
              <h1
                id="nf-title"
                className="text-xl font-semibold text-text-0"
              >
                This page doesn&apos;t exist or was moved.
              </h1>
              <p className="mt-1 text-sm text-text-2">
                The Rokki home is one click away. If you got here from a link
                inside the app, let us know — we&apos;ll fix it.
              </p>
              {path ? (
                <p className="mt-3 break-all rounded-sm border border-border bg-bg-0 px-2 py-1 font-mono text-[11px] text-text-3">
                  {path}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 rounded-sm border border-accent bg-accent-subtle px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-accent hover:bg-accent/20"
              >
                <ArrowLeft className="h-3 w-3" /> Back to dashboard
              </Link>
              <Link
                href="/?palette=1"
                className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-bg-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-text-1 hover:bg-bg-3"
              >
                <Search className="h-3 w-3" /> Search
                <kbd className="ml-1 rounded-sm border border-border bg-bg-0 px-1 font-mono text-[10px] text-text-3">
                  ⌘K
                </kbd>
              </Link>
            </div>
          </div>
          <footer className="border-t border-border px-4 py-2 text-[11px] text-text-3">
            <a
              href={`mailto:support@rokki.ai?subject=${reportSubject}&body=${reportBody}`}
              className="inline-flex items-center gap-1 hover:text-text-1"
            >
              <Mail className="h-3 w-3" /> Report this
            </a>
          </footer>
        </section>
      </main>
    </div>
  );
}
