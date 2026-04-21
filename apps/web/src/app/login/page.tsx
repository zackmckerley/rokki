import { Suspense } from "react";
import { Wordmark } from "@/components/Wordmark";
import { LoginForm } from "./LoginForm";
import { LoginBackground } from "./LoginBackground";

export const metadata = {
  title: "Sign in · Rokki",
};

/**
 * Login page.
 *
 * 4K space-nebula video fills the viewport, autoplays muted on loop. A
 * two-layer overlay (top-to-bottom gradient + radial vignette) keeps the
 * form card at WCAG-AA contrast without washing out the nebula. Content
 * respects `prefers-reduced-motion` — the video stays paused on its first
 * frame for users who've asked for less motion.
 */
export default function LoginPage() {
  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-black px-4">
      <LoginBackground />

      {/* Content layer — sits above video + overlays. Each text block
          gets its own translucent dark backing so the nebula doesn't
          fight the wordmark or footer copy. The form panel stays fully
          opaque (most important visual hierarchy). */}
      <div className="relative z-10 w-full max-w-sm space-y-3">
        <div className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-bg-1/70 px-5 py-3 backdrop-blur-md">
          <Wordmark size="lg" />
          <p className="text-[11px] text-text-1">
            The terminal for your projects.
          </p>
        </div>

        {/* Solid form panel. */}
        <div className="rounded-lg border border-border bg-bg-1 p-5 shadow-2xl ring-1 ring-black/40">
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>

        <div className="rounded-lg border border-border bg-bg-1/70 px-3 py-2 backdrop-blur-md">
          <p className="text-center text-[11px] leading-snug text-text-2">
            Email: we send you a magic link.
            <br />
            Admins: use your username and password.
          </p>
        </div>
      </div>
    </div>
  );
}
