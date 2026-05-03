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

// Required by @sentry/nextjs to instrument client-side navigation
// transitions. Without this the browser SDK can't link route changes
// to error events.
//
// Briefly suspected (PR #85) of causing router.push to silently no-op
// on terminal pages and disabled to confirm. It wasn't the culprit —
// the actual cause was a service-worker page-cache drift triggering a
// React #418 hydration mismatch (see public/sw.js v5 comment).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
