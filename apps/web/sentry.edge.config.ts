/**
 * Sentry — edge runtime (middleware + any route exporting `runtime: "edge"`).
 * Edge bundles are smaller/faster — Sentry ships a slimmer SDK there.
 * No-op if SENTRY_DSN isn't set.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: Number(process.env.SENTRY_TRACES ?? "0.1"),
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    enabled: process.env.NODE_ENV !== "test",
  });
}
