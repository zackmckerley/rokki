"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

/**
 * Listens for the browser's `beforeinstallprompt` event and shows a small
 * unobtrusive chip in the bottom-right inviting the user to install Rokki
 * as a PWA. Once installed (or dismissed), it stays hidden — both flags
 * are persisted in localStorage so the chip never re-appears.
 *
 * Bottom-right stack ordering (z-index 40 here) sits below toasts (50+)
 * and modals (overlay/modal tokens are 1040+). It floats above page
 * content but doesn't compete with system overlays.
 *
 * iOS Safari does not fire `beforeinstallprompt` — that platform's install
 * flow is "Share → Add to Home Screen", documented in /help/install.
 */

const DISMISSED_KEY = "rokki_install_dismissed";
const INSTALLED_KEY = "rokki_install_installed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Already installed (display-mode standalone) or previously dismissed —
    // never bother the user again.
    try {
      if (window.matchMedia("(display-mode: standalone)").matches) return;
      if (localStorage.getItem(INSTALLED_KEY) === "1") return;
      if (localStorage.getItem(DISMISSED_KEY) === "1") return;
    } catch {
      // Private mode / disabled storage — fall through and trust the events.
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
      setHidden(false);
    };

    const onInstalled = () => {
      try {
        localStorage.setItem(INSTALLED_KEY, "1");
      } catch {
        // ignore
      }
      setHidden(true);
      setEvent(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!event) return;
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === "accepted") {
        try {
          localStorage.setItem(INSTALLED_KEY, "1");
        } catch {
          // ignore
        }
      } else {
        try {
          localStorage.setItem(DISMISSED_KEY, "1");
        } catch {
          // ignore
        }
      }
    } catch {
      // Browser refused — hide and don't nag again this session.
    } finally {
      setHidden(true);
      setEvent(null);
    }
  }

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // ignore
    }
    setHidden(true);
    setEvent(null);
  }

  if (hidden || !event) return null;

  return (
    <div
      role="dialog"
      aria-label="Install Rokki"
      className="fixed bottom-4 right-4 z-40 flex max-w-sm items-center gap-2 rounded border border-border bg-bg-1 px-3 py-2 shadow-lg"
    >
      <Download
        className="h-3.5 w-3.5 flex-shrink-0 text-accent"
        aria-hidden="true"
      />
      <p className="flex-1 text-xs text-text-1">
        Install Rokki for faster access.
      </p>
      <button
        type="button"
        onClick={() => void install()}
        className="rounded-sm border border-accent bg-accent-subtle px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-accent hover:bg-accent/20"
      >
        Install
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss install prompt"
        className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-text-3 hover:bg-bg-3 hover:text-text-0"
      >
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
    </div>
  );
}
