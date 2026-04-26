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
 *   import { logEvent, captureError, withObservability } from "@/lib/observability";
 *
 *   logEvent("info", "user.signed_in", { user_id });        // → Axiom
 *   captureError(err, { route: "/api/v1/whatever" });        // → Sentry
 *   export const POST = withObservability(originalHandler); // wraps API routes
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
