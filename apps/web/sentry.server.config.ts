/**
 * Sentry — Node server runtime (route handlers, server components, edge
 * functions running on Node). Loaded automatically by @sentry/nextjs's
 * webpack plugin. No-op if SENTRY_DSN isn't set.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: Number(process.env.SENTRY_TRACES ?? "0.1"),
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    enabled: process.env.NODE_ENV !== "test",
    // Attach the request body (sanitized) — helps debug 5xx without
    // re-running. Sentry strips obvious secrets server-side.
    sendDefaultPii: false,
  });
}
