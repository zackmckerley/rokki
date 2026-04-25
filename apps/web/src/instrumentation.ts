/**
 * Next.js 15 instrumentation hook — runs once at server boot. We use it
 * to load the right Sentry config for whichever runtime the route is
 * about to execute in (nodejs vs edge). Without this hook the server &
 * edge SDKs only initialize on the first request, which means we miss
 * exceptions during cold start.
 *
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}
