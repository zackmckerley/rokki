/**
 * Next.js 15 instrumentation hook — runs once at server boot. We use it
 * to load the right Sentry config for whichever runtime the route is
 * about to execute in (nodejs vs edge). Without this hook the server &
 * edge SDKs only initialize on the first request, which means we miss
 * exceptions during cold start.
 *
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
    // Register the module-system manifests at server boot. Importing
    // for the side effect (the index file calls `registerModule(...)`
    // for each manifest); no symbols are consumed from the import.
    await import("./modules");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

// Routes errors thrown inside nested React Server Components to Sentry.
// Without this hook, RSC render-time exceptions only show as generic
// 500s in the network tab — Sentry never sees them.
// https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation#onrequesterror-optional
export const onRequestError = Sentry.captureRequestError;
