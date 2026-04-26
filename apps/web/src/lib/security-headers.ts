/**
 * Centralised security-header policy. Set on every response by the
 * middleware so the rules apply uniformly to pages, API routes,
 * og-image renderers, and static assets served through Next.
 *
 * What's here is conservative-by-default. Loosen specific directives
 * (e.g. add a host to `connect-src`) before broadening any of them
 * globally — the whole point of CSP is that the failure mode is a
 * console error you can trace, not a silent privilege grant.
 *
 * `Content-Security-Policy` is the only one that takes any thought:
 *
 * - script-src: 'self' + 'unsafe-inline' reluctantly. Next.js 15 + React
 *   19 ship inline scripts (the theme bootstrap in layout.tsx is one,
 *   the framework streaming bootstrap is another). Migrating to a nonce
 *   would require threading one through every <Script> and inline
 *   <script>, plus reconciling with @sentry/nextjs auto-injection. That
 *   is a worthwhile follow-up but out of scope here. `'wasm-unsafe-eval'`
 *   keeps PDF.js / WASM-backed libs working.
 *
 * - style-src: 'unsafe-inline' is required by Tailwind (style attributes)
 *   and by next/font's auto-injected <style> blocks.
 *
 * - connect-src: built up from the env so we don't hard-code the
 *   Supabase project URL. Sentry's ingest hosts are added when a DSN is
 *   set; otherwise we leave them out.
 *
 * - frame-ancestors: 'none' (mirrors X-Frame-Options DENY for browsers
 *   that prefer CSP). The legacy header is set too for older agents.
 *
 * - object-src 'none', base-uri 'self', form-action 'self' close the
 *   most common bypasses (Flash, base-tag injection, off-site form
 *   submission).
 */

function originOf(envUrl: string | undefined): string | null {
  if (!envUrl) return null;
  try {
    const u = new URL(envUrl);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

function sentryIngestHosts(): string[] {
  // Sentry ingest hostnames are derived from the DSN. We don't have a
  // resolver here and we don't want to require the DSN to be parsed at
  // build time, so allow the canonical wildcard set used by Sentry's
  // SaaS regions. Self-hosted Sentry users can extend via
  // SENTRY_INGEST_ORIGIN.
  const dsn =
    process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN ?? "";
  if (!dsn) return [];
  const explicit = process.env.NEXT_PUBLIC_SENTRY_INGEST_ORIGIN;
  if (explicit) return [explicit];
  return [
    "https://*.ingest.sentry.io",
    "https://*.ingest.us.sentry.io",
    "https://*.ingest.de.sentry.io",
  ];
}

export function buildContentSecurityPolicy(): string {
  const supabaseOrigin = originOf(process.env.NEXT_PUBLIC_SUPABASE_URL);
  // Realtime uses wss on the same host as the REST URL.
  const supabaseWss =
    supabaseOrigin?.replace(/^https:/, "wss:").replace(/^http:/, "ws:") ??
    null;

  const sentry = sentryIngestHosts();

  const connectSrc = [
    "'self'",
    supabaseOrigin,
    supabaseWss,
    ...sentry,
    // Vercel Analytics — keeps the directive ready even if Analytics
    // gets enabled later. Removing it doesn't break anything if unused.
    "https://vitals.vercel-insights.com",
  ].filter(Boolean) as string[];

  const imgSrc = ["'self'", "data:", "blob:", supabaseOrigin].filter(
    Boolean,
  ) as string[];

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'unsafe-inline' is needed for the layout.tsx theme bootstrap and
    // Next.js streaming bootstrap. 'wasm-unsafe-eval' covers PDF.js etc.
    "script-src": ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": imgSrc,
    "font-src": ["'self'", "data:"],
    "connect-src": connectSrc,
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "upgrade-insecure-requests": [],
  };

  return Object.entries(directives)
    .map(([key, vals]) => (vals.length ? `${key} ${vals.join(" ")}` : key))
    .join("; ");
}

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "Strict-Transport-Security":
    "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=()",
  // Mirrors `frame-ancestors 'none'` for legacy clients that don't
  // honour CSP frame-ancestors.
  "X-Frame-Options": "DENY",
} as const;

export function applySecurityHeaders(headers: Headers): void {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    headers.set(k, v);
  }
  headers.set("Content-Security-Policy", buildContentSecurityPolicy());
}
