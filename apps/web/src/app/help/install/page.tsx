import Link from "next/link";
import {
  Apple,
  Chrome,
  Download,
  Smartphone,
  Monitor,
  Share,
} from "lucide-react";
import { TopBar } from "@/components/TopBar";

export const metadata = {
  title: "Install Rokki — Help",
};

/**
 * Per-platform PWA install instructions.
 *
 * Linked from `/help` and from the InstallPrompt's "What's this?" affordance
 * on browsers that don't fire `beforeinstallprompt` (notably iOS Safari,
 * which requires a manual Share-sheet flow).
 *
 * Keep the language operational. No marketing.
 */
export default function HelpInstallPage() {
  return (
    <div className="flex min-h-screen flex-col bg-bg-0">
      <TopBar>
        <Link href="/help" className="text-text-3 hover:text-text-1">
          ← Help
        </Link>
        <span className="text-text-3">·</span>
        <span className="text-text-0">Install</span>
      </TopBar>

      <main className="mx-auto w-full max-w-3xl flex-1 p-6">
        <header className="mb-6">
          <h1 className="font-display flex items-center gap-3 text-3xl text-text-0">
            <Download className="h-6 w-6 text-accent" />
            Install Rokki
          </h1>
          <p className="mt-1 text-xs text-text-3">
            Rokki runs as a Progressive Web App. Installing pins it to your
            dock or home screen and opens it in its own window — no address
            bar, no browser chrome, faster cold start.
          </p>
        </header>

        <section
          aria-labelledby="desktop-h"
          className="mb-4 overflow-hidden rounded border border-border bg-bg-1"
        >
          <header className="flex items-center gap-1.5 border-b border-border bg-bg-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-3">
            <Monitor className="h-3 w-3" />
            <span id="desktop-h">Mac &amp; Windows — Chrome / Edge</span>
          </header>
          <ol className="divide-y divide-border text-sm text-text-1">
            <li className="flex gap-3 px-4 py-3">
              <span className="font-mono text-text-3">1</span>
              <span>
                Look for the <Chrome className="inline h-3.5 w-3.5 text-text-2" />{" "}
                install icon in the address bar (right side, looks like a
                monitor with a down-arrow).
              </span>
            </li>
            <li className="flex gap-3 px-4 py-3">
              <span className="font-mono text-text-3">2</span>
              <span>
                Click it, then click <strong>Install</strong> in the popup.
              </span>
            </li>
            <li className="flex gap-3 px-4 py-3">
              <span className="font-mono text-text-3">3</span>
              <span>
                Rokki opens in its own window. Pin it to your dock /
                taskbar from there.
              </span>
            </li>
          </ol>
          <p className="border-t border-border bg-bg-2 px-4 py-2 text-[11px] text-text-3">
            If you don&apos;t see the icon, the install chip should appear in
            the bottom-right of any Rokki page on first visit.
          </p>
        </section>

        <section
          aria-labelledby="ios-h"
          className="mb-4 overflow-hidden rounded border border-border bg-bg-1"
        >
          <header className="flex items-center gap-1.5 border-b border-border bg-bg-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-3">
            <Apple className="h-3 w-3" />
            <span id="ios-h">iPhone / iPad — Safari</span>
          </header>
          <ol className="divide-y divide-border text-sm text-text-1">
            <li className="flex gap-3 px-4 py-3">
              <span className="font-mono text-text-3">1</span>
              <span>
                Tap the <Share className="inline h-3.5 w-3.5 text-text-2" />{" "}
                Share button at the bottom of the screen.
              </span>
            </li>
            <li className="flex gap-3 px-4 py-3">
              <span className="font-mono text-text-3">2</span>
              <span>
                Scroll down and tap <strong>Add to Home Screen</strong>.
              </span>
            </li>
            <li className="flex gap-3 px-4 py-3">
              <span className="font-mono text-text-3">3</span>
              <span>
                Confirm the name, tap <strong>Add</strong>. The Rokki icon
                appears on your home screen and launches full-screen.
              </span>
            </li>
          </ol>
          <p className="border-t border-border bg-bg-2 px-4 py-2 text-[11px] text-text-3">
            iOS does not auto-prompt — Safari hides the install flow behind
            the Share sheet.
          </p>
        </section>

        <section
          aria-labelledby="android-h"
          className="mb-4 overflow-hidden rounded border border-border bg-bg-1"
        >
          <header className="flex items-center gap-1.5 border-b border-border bg-bg-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-3">
            <Smartphone className="h-3 w-3" />
            <span id="android-h">Android — Chrome</span>
          </header>
          <ol className="divide-y divide-border text-sm text-text-1">
            <li className="flex gap-3 px-4 py-3">
              <span className="font-mono text-text-3">1</span>
              <span>
                Tap the <strong>⋮</strong> menu (top-right of Chrome).
              </span>
            </li>
            <li className="flex gap-3 px-4 py-3">
              <span className="font-mono text-text-3">2</span>
              <span>
                Tap <strong>Install app</strong> (or <strong>Add to Home
                screen</strong> on older versions).
              </span>
            </li>
            <li className="flex gap-3 px-4 py-3">
              <span className="font-mono text-text-3">3</span>
              <span>
                Confirm. The Rokki icon lands on your home screen and runs
                in its own task.
              </span>
            </li>
          </ol>
        </section>

        <section
          aria-labelledby="why-h"
          className="overflow-hidden rounded border border-border bg-bg-1"
        >
          <header className="border-b border-border bg-bg-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-3">
            <span id="why-h">Why install?</span>
          </header>
          <ul className="divide-y divide-border text-xs text-text-1">
            <li className="px-4 py-2">
              No browser chrome — more vertical space for the dense
              terminal layout.
            </li>
            <li className="px-4 py-2">
              Push notifications for assignments and approvals (after you
              opt in from Settings → Notifications).
            </li>
            <li className="px-4 py-2">
              The shell loads instantly from the service worker cache;
              first paint feels native even on flaky networks.
            </li>
            <li className="px-4 py-2">
              Standalone display means ⌘K opens the command palette —
              not your browser&apos;s URL bar.
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
