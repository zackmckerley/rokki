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

      {/* Content layer — sits above video + overlays */}
      <div className="relative z-10 w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-2">
          <Wordmark size="lg" />
          <p className="text-xs text-white/70 drop-shadow">
            The terminal for your projects.
          </p>
        </div>

        <div className="rounded-lg border border-white/10 bg-black/40 p-5 shadow-2xl backdrop-blur-md">
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>

        <p className="text-center text-xs text-white/60 drop-shadow">
          No password, no install. We&apos;ll email you a link.
          <br />
          First time here? An admin needs to invite you.
        </p>
      </div>
    </div>
  );
}
