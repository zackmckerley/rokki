"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isEditableTarget } from "@/lib/shortcuts";
import {
  resolveFKey,
  type FKeyPin,
  type FKeyScope,
} from "@/lib/modules/fkey-resolver";

/**
 * Wire F1-F10 to navigate. F1-F4 are fixed (Help / Tasks /
 * Messenger / Tools-greyed); F5-F10 are user-pinnable via
 * `user_module_pins.fn_key`.
 *
 * The hook mounts a single keydown listener on `window` and uses
 * `resolveFKey` (pure) to compute the navigation target. Skips when
 * the user is typing in an input/textarea/contenteditable so the
 * shortcut doesn't fight a real keystroke.
 *
 * Pins are passed in from the server-rendered page; the hook itself
 * doesn't fetch. That keeps the resolver synchronous and
 * test-friendly.
 */
export function useFKeyShortcuts(scope: FKeyScope, pins: FKeyPin[]): void {
  const router = useRouter();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;
      // No modifiers — F-keys are bare keypresses.
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const href = resolveFKey(e.key, scope, pins);
      if (!href) return;
      e.preventDefault();
      router.push(href);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scope, pins, router]);
}
