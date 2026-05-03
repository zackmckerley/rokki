"use client";

import { useEffect } from "react";

const EXPECTED_SW_VERSION = "v4";

/**
 * Registers the PWA service worker on mount, in production only. Dev runs
 * without the SW so source-map/HMR aren't masked by stale cache.
 *
 * Also handles two recovery flows:
 *
 * 1. **Auto-reload on SW activation.** When a new SW takes over via
 *    skipWaiting + clients.claim, it broadcasts an SW_ACTIVATED
 *    message. Open tabs reload so they immediately use the new SW's
 *    responses instead of staying stuck on whatever the old SW had
 *    cached.
 *
 * 2. **Mismatch fallback.** If the SW currently controlling the page
 *    is not the version this build expects (e.g. user has been on the
 *    same tab through multiple deploys), force-unregister + reload.
 *    Belt-and-suspenders behind #1 for cases where the activation
 *    broadcast was missed.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    let reloaded = false;
    const reloadOnce = (reason: string) => {
      if (reloaded) return;
      reloaded = true;
      console.info("[pwa] reloading:", reason);
      window.location.reload();
    };

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; version?: string } | null;
      if (!data || typeof data !== "object") return;
      if (data.type === "SW_ACTIVATED") {
        reloadOnce(`SW_ACTIVATED ${data.version ?? "?"}`);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);

    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(async (reg) => {
        try {
          await reg.update();
        } catch {
          /* non-fatal */
        }
        const controller = navigator.serviceWorker.controller;
        if (!controller) return;
        const channel = new MessageChannel();
        const versionPromise = new Promise<string | null>((resolve) => {
          const t = window.setTimeout(() => resolve(null), 1500);
          channel.port1.onmessage = (ev) => {
            window.clearTimeout(t);
            const v =
              (ev.data as { version?: string } | null)?.version ?? null;
            resolve(v);
          };
        });
        controller.postMessage({ type: "VERSION_CHECK" }, [channel.port2]);
        const version = await versionPromise;
        if (version && version !== EXPECTED_SW_VERSION) {
          console.warn(
            `[pwa] sw version mismatch: page expects ${EXPECTED_SW_VERSION}, controller is ${version}; unregistering`,
          );
          try {
            await reg.unregister();
          } catch {
            /* non-fatal */
          }
          reloadOnce("version mismatch");
        }
      })
      .catch((err) => {
        console.warn("[pwa] service worker failed to register:", err);
      });

    return () => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, []);
  return null;
}
