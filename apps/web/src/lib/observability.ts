/**
 * Observability — Sentry + Axiom in one place.
 *
 * Both are opt-in via env. If the relevant env vars aren't set we no-op
 * silently so local dev doesn't pay the cost.
 *
 *   SENTRY_DSN              — Sentry project DSN
 *   AXIOM_TOKEN             — Axiom API token
 *   AXIOM_DATASET           — Axiom dataset name (e.g. "rokki-prod-logs")
 *   NEXT_PUBLIC_SENTRY_DSN  — same DSN exposed to the browser bundle
 *                              (Sentry's browser SDK reads it)
 *
 * Usage:
 *   import { logEvent, captureError, withObservability, traceSpan, traceBreadcrumb }
 *     from "@/lib/observability";
 *
 *   logEvent("info", "user.signed_in", { user_id });        // → Axiom
 *   captureError(err, { route: "/api/v1/whatever" });        // → Sentry
 *   export const POST = withObservability(originalHandler); // wraps API routes
 *
 *   // Wrap a slow callsite (DB, AI, fetch) so it shows up in the Sentry waterfall:
 *   const rows = await traceSpan(
 *     { name: "db.dashboard.spaces", op: "db.query" },
 *     () => loadDashSpaces(supabase, userId),
 *   );
 *
 *   // Drop a marker on the current trace (no timing, just an event):
 *   traceBreadcrumb({ category: "realtime", message: "channel.subscribe", data: { … } });
 *
 * See `docs/13_OBSERVABILITY.md` for the full trace surface and tradeoffs.
 */

import * as SentryNs from "@sentry/nextjs";
import { Axiom } from "@axiomhq/js";
import type { NextRequest } from "next/server";
import { redactPII } from "@/lib/pii-redact";

const sentryEnabled =
  Boolean(process.env.SENTRY_DSN) || Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);
const axiomEnabled = Boolean(
  process.env.AXIOM_TOKEN && process.env.AXIOM_DATASET,
);

let _axiom: Axiom | null = null;
function axiomClient(): Axiom | null {
  if (!axiomEnabled) return null;
  if (_axiom) return _axiom;
  _axiom = new Axiom({ token: process.env.AXIOM_TOKEN! });
  return _axiom;
}

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

/**
 * Send a structured event to Axiom. No-ops if AXIOM_TOKEN/DATASET aren't set.
 * Fire-and-forget — don't await; never blocks request paths.
 *
 * Every field passes through `redactPII` first so emails/phones/IPs/
 * tokens never reach the Axiom dataset.
 */
export function logEvent(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const ax = axiomClient();
  if (!ax) return;
  try {
    const safeFields = redactPII(fields) as Record<string, unknown>;
    ax.ingest(process.env.AXIOM_DATASET!, [
      {
        _time: new Date().toISOString(),
        level,
        event,
        ...safeFields,
      },
    ]);
  } catch {
    // Never let observability break the caller.
  }
}

/**
 * Send a thrown error to Sentry with optional structured context. Always
 * also logs an Axiom 'error' event so both pipelines see it.
 */
export function captureError(
  err: unknown,
  context: Record<string, unknown> = {},
): void {
  const message = err instanceof Error ? err.message : String(err);
  // Sentry's beforeSend already redacts the event body, but `extra`
  // arrives as-is — pre-redact so we never depend on a single layer.
  const safeContext = redactPII(context) as Record<string, unknown>;
  if (sentryEnabled) {
    try {
      SentryNs.captureException(err, { extra: safeContext });
    } catch {}
  }
  logEvent("error", "exception", { message, ...safeContext });
}

/**
 * Wrap a Next.js route handler so any thrown exception is captured to
 * Sentry + Axiom *before* being re-thrown. Pairs naturally with the
 * standard `(req: NextRequest, ctx?) => Response` signature.
 *
 *   export const POST = withObservability(async (req) => { … });
 */
type Handler<C = undefined> = (
  req: NextRequest,
  ctx: C,
) => Promise<Response> | Response;

export function withObservability<C = undefined>(
  fn: Handler<C>,
  routeLabel?: string,
): Handler<C> {
  return async (req, ctx) => {
    const start = Date.now();
    try {
      const res = await fn(req, ctx);
      logEvent("info", "request", {
        route: routeLabel ?? new URL(req.url).pathname,
        method: req.method,
        status: res.status,
        duration_ms: Date.now() - start,
      });
      return res;
    } catch (err) {
      captureError(err, {
        route: routeLabel ?? new URL(req.url).pathname,
        method: req.method,
        duration_ms: Date.now() - start,
      });
      throw err;
    }
  };
}

export const Sentry = SentryNs;

// -----------------------------------------------------------------------------
// Tracing helpers
//
// Sentry's Next.js integration auto-instruments page renders, server actions,
// route handlers, fetches, and the OTel-traced parts of `next start`. The
// helpers below cover the gaps it does NOT auto-instrument:
//
//   - Supabase calls (`.from(...).select(...)` etc.) — they go through
//     postgrest fetch but with opaque names; wrap a friendly name around
//     each high-traffic helper so the waterfall reads like a story.
//   - Realtime channel lifecycle (subscribe / unsubscribe / errors) —
//     emit breadcrumbs so a 500 error on an API call mid-session shows
//     the channel timeline that led to it.
//   - In-house BYOK AI/tool fetches that hop through our executor — wrap
//     them so the full upstream→executor→model latency is one waterfall.
//
// All helpers no-op cleanly when Sentry isn't initialised so local dev
// never pays for them.
// -----------------------------------------------------------------------------

/**
 * Standard Sentry span operation labels. Sticking to these keeps the
 * Sentry UI happy (it has special icons / colourings for known ops):
 *
 *   db.query   — any database read/write
 *   ai.run     — generative model inference
 *   ai.tool    — tool/function call invoked by the model
 *   http.client — outbound HTTP (e.g. our tool executor)
 *   subscribe  — pubsub / websocket subscribe
 */
export type TraceOp =
  | "db.query"
  | "ai.run"
  | "ai.tool"
  | "http.client"
  | "subscribe";

export interface TraceSpanOptions {
  /** Short human-readable label, e.g. "db.dashboard.spaces". */
  name: string;
  /** Standardised operation kind, see TraceOp. */
  op: TraceOp;
  /** Free-form tags surfaced as span attributes. Keep keys snake_case. */
  attributes?: Record<string, string | number | boolean | undefined>;
}

/**
 * Run `fn` inside a Sentry span. The span auto-closes on resolution and
 * inherits the active trace — when called inside a route handler it nests
 * under the route's transaction; when called from a Server Component it
 * nests under the page render transaction.
 *
 * Falls through to a plain await when Sentry isn't initialised so local
 * dev (and tests) don't pay the wrapping cost.
 */
export async function traceSpan<T>(
  options: TraceSpanOptions,
  fn: () => Promise<T>,
): Promise<T> {
  if (!sentryEnabled) return fn();
  return SentryNs.startSpan(
    {
      name: options.name,
      op: options.op,
      attributes: cleanAttrs(options.attributes),
    },
    async () => fn(),
  );
}

/**
 * Sync variant of `traceSpan` for the rare callsite that's already
 * synchronous. Most call paths should prefer the async form.
 */
export function traceSpanSync<T>(
  options: TraceSpanOptions,
  fn: () => T,
): T {
  if (!sentryEnabled) return fn();
  return SentryNs.startSpan(
    {
      name: options.name,
      op: options.op,
      attributes: cleanAttrs(options.attributes),
    },
    () => fn(),
  );
}

/**
 * Drop a breadcrumb on the active scope. Breadcrumbs are timestamped
 * markers attached to whatever error / event fires next on the same
 * scope — perfect for "what was the user doing right before this 500?".
 *
 * Use this for events that aren't worth a span (no real duration) but
 * are worth seeing in the timeline: realtime channel subscribe/unsub,
 * push notification permission grants, command palette execution.
 */
export interface TraceBreadcrumb {
  category: string;
  message: string;
  data?: Record<string, unknown>;
  level?: "debug" | "info" | "warning" | "error";
}

export function traceBreadcrumb(crumb: TraceBreadcrumb): void {
  if (!sentryEnabled) return;
  try {
    SentryNs.addBreadcrumb({
      category: crumb.category,
      message: crumb.message,
      data: crumb.data,
      level: crumb.level ?? "info",
    });
  } catch {
    // Never let observability break the caller.
  }
}

/** Strip undefined values so Sentry doesn't render them as "undefined". */
function cleanAttrs(
  attrs: Record<string, string | number | boolean | undefined> | undefined,
): Record<string, string | number | boolean> | undefined {
  if (!attrs) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}
