/**
 * Sentry — browser side. Loaded by Next 15.3+ via the new
 * `instrumentation-client.ts` convention. Replaces the legacy
 * `sentry.client.config.ts` that the @sentry/nextjs webpack plugin
 * used to auto-discover (deprecated; broken under Turbopack).
 *
 * No-op if NEXT_PUBLIC_SENTRY_DSN isn't set.
 *
 * https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client
 */
import * as Sentry from "@sentry/nextjs";
import { redactPII } from "@/lib/pii-redact";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES ?? "0.1"),
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
    enabled: process.env.NODE_ENV !== "test",
    beforeSend(event) {
      return redactPII(event) as typeof event;
    },
    beforeBreadcrumb(breadcrumb) {
      return redactPII(breadcrumb) as typeof breadcrumb;
    },
  });
}

// DIAGNOSTIC: temporarily NOT exporting Sentry.captureRouterTransitionStart
// to test whether it's the cause of router.push silently no-op'ing on
// terminal pages. If router.push works after this deploys, Sentry's
// transition-start hook is interfering with Next.js's App Router
// transition queue and we need to either upgrade @sentry/nextjs, drop
// the hook permanently, or wrap it. Re-add once confirmed.
//
// export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
