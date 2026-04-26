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
 * content card at WCAG-AA contrast without washing out the nebula. The
 * card itself is a single solid panel containing wordmark, tagline,
 * form, and footer copy — no see-through text.
 */
export default function LoginPage() {
  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-black px-4">
      <LoginBackground />

      {/* Single content card — wordmark, tagline, form, footer all
          inside one solid panel so every text element has a backing. */}
      <div className="relative z-10 w-full max-w-sm rounded-lg border border-border bg-bg-1 p-6 shadow-2xl ring-1 ring-black/40">
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
