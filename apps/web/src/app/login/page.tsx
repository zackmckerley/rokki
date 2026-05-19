import { Wordmark } from "@/components/Wordmark";
import { LoginForm } from "./LoginForm";

export const metadata = {
  title: "Sign in · Rokki",
};

interface Props {
  searchParams: Promise<{
    redirect_to?: string;
    error?: string;
  }>;
}

/**
 * Login page.
 *
 * Server-rendered single-paint: no Suspense, no client-side fetches,
 * no async loading boundaries. The entire viewport renders in one
 * pass — wordmark, form, footer, background — and the user sees a
 * complete page from the first frame.
 *
 * Performance notes:
 *   - Static CSS gradient instead of the previous 4K nebula video
 *     (~31 MB MP4 with a 700 ms fade-in). Result: first-paint goes
 *     from "blank black ➜ video pops in ➜ form pops in" to a single
 *     atomic render that's the same byte cost as the page HTML
 *     itself.
 *   - `redirect_to` and `error` query params are read here (server
 *     component) and passed to `LoginForm` as plain props. The form
 *     no longer needs `useSearchParams`, so it doesn't need a
 *     `<Suspense>` wrapper and SSRs fully in the initial HTML.
 *   - No JavaScript fires before the form is interactive — Next.js
 *     hydrates the small client component in place.
 */
export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const redirectTo = sanitizeRedirect(params.redirect_to);
  const callbackError = typeof params.error === "string" ? params.error : null;

  return (
    <main
      className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-4"
      style={{
        background:
          "radial-gradient(ellipse 80% 55% at 50% 18%, rgba(245, 166, 35, 0.06) 0%, transparent 55%)," +
          "radial-gradient(ellipse 100% 70% at 50% 100%, rgba(245, 166, 35, 0.025) 0%, transparent 45%)," +
          "linear-gradient(180deg, #0a0a0b 0%, #0d0d10 50%, #121214 100%)",
      }}
    >
      {/* Subtle horizontal lattice — barely visible texture so the
          background reads as "designed" not "default." Renders before
          anything else paints because it's a single CSS gradient. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(to bottom, rgba(255,255,255,0) 0, rgba(255,255,255,0) 1px, rgba(255,255,255,0.012) 1px, rgba(255,255,255,0) 2px)",
          backgroundSize: "100% 3px",
          opacity: 0.5,
        }}
      />

      <section className="relative z-10 w-full max-w-[400px]">
        {/* Wordmark + tagline outside the card, larger, more breath.
            A login screen is the first impression of the app — the
            mark should anchor without competing with the form. */}
        <header className="mb-6 flex flex-col items-center gap-1.5">
          <Wordmark size="lg" />
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-3">
            The terminal for your projects
          </p>
        </header>

        {/* Form card. Tight ring + soft shadow gives the panel
            depth without being heavy. */}
        <div className="rounded-lg border border-border bg-bg-1/95 p-7 shadow-2xl shadow-black/50 ring-1 ring-black/40 backdrop-blur-sm">
          <h1 className="mb-1 text-lg font-semibold text-text-0">
            Sign in
          </h1>
          <p className="mb-5 text-[12px] leading-relaxed text-text-2">
            Use the credentials your administrator provisioned.
          </p>
          <LoginForm
            redirectTo={redirectTo}
            callbackError={callbackError}
          />
        </div>

        <footer className="mt-5 text-center text-[11px] leading-relaxed text-text-3">
          Accounts are provisioned by an administrator — no self-signup.{" "}
          <a
            href="mailto:support@rokki.ai?subject=Lost%20access%20to%20Rokki"
            className="text-text-2 underline-offset-2 hover:text-text-1 hover:underline"
          >
            Lost access?
          </a>
        </footer>
      </section>
    </main>
  );
}

/**
 * Only allow same-origin relative paths in `redirect_to`. Any
 * absolute URL or scheme is dropped silently (the form falls back
 * to `/`). Protects against open-redirect phishing.
 */
function sanitizeRedirect(raw: string | undefined): string {
  if (!raw || typeof raw !== "string") return "/";
  // Must start with a single `/` and not be a protocol-relative URL
  // like `//evil.com`.
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}
