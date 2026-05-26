"use client";

import { Suspense, useCallback, useState } from "react";
import { Wordmark } from "@/components/Wordmark";
import { LoginForm } from "./LoginForm";
import { LoginBackground } from "./LoginBackground";

/**
 * Client wrapper for the login surface. Owns the "video is playing"
 * signal so the content card (wordmark + form + footer) stays hidden
 * until the cosmos has paint.
 *
 * Behaviour:
 *   1. Page paints solid black.
 *   2. <video> starts loading + autoplays.
 *   3. As soon as the video has a paintable frame (or the 1.5s
 *      safety timer in LoginBackground trips), we flip `ready`.
 *   4. The card fades in over 700ms.
 *
 * Until `ready` flips, the card is `opacity-0`, `pointer-events-none`,
 * and `aria-hidden` so it doesn't catch focus or get announced by
 * screen readers. The DOM is still mounted so the form is reachable
 * for keyboard users the moment ready flips.
 *
 * Per Zack: "I want the first thing the person sees is the cosmos
 * video. Then the other items. Don't load the page until the cosmos
 * is playing."
 */
export function LoginCanvas() {
  const [ready, setReady] = useState(false);

  // `useCallback` so LoginBackground's effect doesn't re-run on every
  // parent render (the callback is in its dep array).
  const handleReady = useCallback(() => setReady(true), []);

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-black px-4">
      <LoginBackground onReady={handleReady} />

      {/* Single content card — wordmark, tagline, form, footer all
          inside one solid panel so every text element has a backing.
          Held at opacity-0 until the nebula is playing; transitions
          to opacity-100 with a soft 700ms fade. */}
      <div
        aria-hidden={!ready}
        className={`relative z-10 w-full max-w-sm rounded-lg border border-border bg-bg-1 p-6 shadow-2xl ring-1 ring-black/40 transition-opacity duration-700 ${
          ready ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <div className="mb-5 flex flex-col items-center gap-1.5">
          <Wordmark size="lg" />
          <p className="text-[11px] text-text-2">
            The terminal for your projects.
          </p>
        </div>

        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>

        <p className="mt-5 border-t border-border pt-3 text-center text-[11px] leading-snug text-text-3">
          Sign in with the email or username your administrator
          provisioned. Lost access?{" "}
          <a
            href="mailto:support@rokki.ai?subject=Lost%20access%20to%20Rokki"
            className="text-text-2 underline-offset-2 hover:text-text-1 hover:underline"
          >
            Contact support
          </a>
          .
        </p>
      </div>
    </div>
  );
}
