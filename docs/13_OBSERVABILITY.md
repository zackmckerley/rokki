# 13. Observability

This doc describes the trace surface across Rokki. For error capture and
log shipping, see `apps/web/src/lib/observability.ts`. For the read-only
dashboards we expect operators to live in, see the runbook (TBD when
staging is up).

## TL;DR

- **Errors** → Sentry (`captureError`, also auto-captured from `withObservability`).
- **Logs** → Axiom (`logEvent`, structured key/value).
- **Traces** → Sentry tracing (transactions + spans).
- All three are env-gated and no-op cleanly when their DSN/token isn't set,
  so local dev pays nothing.

## What's traced today

Sentry's Next.js integration auto-instruments:

- Page renders (Server Components, RSC payloads, App Router transitions).
- Route handlers (`app/api/.../route.ts` GET/POST/etc.).
- Server actions and middleware.
- Outbound `fetch` calls (HTTP client spans, including the call into our
  tool executor — but we wrap it in a named span anyway, see below).
- Browser navigation transitions and page-load metrics (Web Vitals).

We add manual spans + breadcrumbs for the gaps Sentry can't see:

| Surface | Where | Sentry op |
|---|---|---|
| Dashboard query helpers | `apps/web/src/lib/dashboard-queries.ts` | `db.query` |
| Tool executor RPC | `apps/web/src/app/api/v1/tools/[slug]/invoke/route.ts` | `ai.tool` |
| Realtime postgres_changes | `apps/web/src/lib/supabase/realtime.ts` | breadcrumb (`realtime`) |
| Realtime presence | `apps/web/src/components/TeamPane.tsx` | breadcrumb (`realtime`) |
| Session-revocation channel | `apps/web/src/components/SessionGuard.tsx` | breadcrumb (`realtime`/`auth`) |

### What's *not* traced (yet)

These callsites still ride on Sentry's default fetch instrumentation; we
haven't given them named spans because they're not currently a perf hot
spot. Add named spans when one becomes one:

- Direct `supabase.from(...)` calls inside individual route handlers
  (e.g. `/api/v1/projects`, `/api/v1/tasks/...`). The route's transaction
  still captures total duration; the database round-trip just shows up
  as an unnamed `http.client` span pointing at PostgREST.
- Calendar OAuth refresh inside `lib/calendar-oauth.ts`.
- Push notification fan-out inside `lib/push-client.ts`.
- File upload presigning (S3/Azure Blob).

When you add a span to one of these, also add a row to the table above.

## How to read a Sentry waterfall

A trace is one tree of spans. The root is a "transaction" — usually one
HTTP request or one page navigation. Children are spans nested under it.
Sentry's UI renders this as a Gantt chart.

What you're looking for, in priority order:

1. **One huge span at the bottom.** Almost every slow trace is dominated
   by a single span. Find it, click it, look at the attributes.
2. **A waterfall of N short spans in series that should be parallel.**
   Classic N+1: a list page fetching one row per item. Reorder to a
   batched query.
3. **A gap between two child spans.** That gap is CPU on the parent —
   often JSON parsing or in-memory filtering. Profile if material.
4. **A `db.query` span far longer than its peers.** Missing index or
   cache miss; reproduce with `EXPLAIN ANALYZE`.

For tool invocations (`ai.tool` op), the executor's own duration shows up
as a child span; subtract that from the wall clock to see how much time
is spent in our request marshalling vs the actual model.

## Sample rate trade-offs

We default to:

- `SENTRY_TRACES=0.1` in production (10% of requests sampled).
- `SENTRY_TRACES=1.0` in development.
- `NEXT_PUBLIC_SENTRY_TRACES=0.1` in production browsers.

Sample rate is a multiplier on Sentry cost (their billing meters are
event-count-based). At 10% on prod, a request handling 1k req/min sends
~6k transactions/min. That's a $1k/mo Sentry plan ballpark.

When to bump it up:

- **Investigating a specific issue:** set `SENTRY_TRACES=1.0` for the
  duration of the investigation, on a single Vercel preview deploy. Keep
  it scoped — leaving it on for prod multiplies cost 10×.
- **Pre-launch:** the first month after a big release, run at 50% so the
  initial perf delta is statistically meaningful. Drop back to 10% once
  the baseline stabilises.

When to drop it lower:

- **Cost panic:** if Sentry billing spikes, drop to 1% on prod, keep
  errors at 100% (Sentry has separate sampling for errors vs traces;
  errors are always sampled at 100% — the rate only affects perf data).

We do **not** use `tracesSampler` (function form) yet. Once we have
real traffic patterns, switch to a sampler so we can keep slow requests
at 100% and fast ones at 1%, which is way more useful per dollar.

## Adding a span to a new code path

Use the helpers in `lib/observability.ts`:

```ts
import { traceSpan, traceBreadcrumb } from "@/lib/observability";

// Wrap a slow async block:
const result = await traceSpan(
  {
    name: "rag.embed_chunks",
    op: "ai.run",
    attributes: { count: chunks.length, model: "voyage-3" },
  },
  async () => await embedAll(chunks),
);

// Or drop a marker on the trace timeline (no duration):
traceBreadcrumb({
  category: "tool",
  message: "approval.granted",
  data: { tool_id: tool.id },
});
```

Rules of thumb:

1. **Every external I/O gets a span.** DB query, model call, presigned
   URL request, webhook fan-out — anything where ">100ms" is plausible.
2. **Stick to standard ops.** `db.query`, `ai.run`, `ai.tool`,
   `http.client`, `subscribe`. Sentry colours and groups by op; custom
   ops dilute the signal.
3. **Use snake_case attribute keys.** Stay consistent with the
   `tool_slug`, `table`, `n_ids` etc. already in use so dashboards
   group cleanly.
4. **Don't span trivial work.** Wrapping a 50µs object lookup just adds
   noise. If you wouldn't grep for it in a flame graph, don't span it.
5. **Breadcrumbs for stateful events.** Channel subscribe, push
   permission grant, command palette opened — anything you'd want to see
   on the timeline of a 5xx that fires later in the same session.

When you instrument a new code path, add a row to "What's traced today"
above. The doc is the source of truth for what you can rely on existing.

## Local development

Tracing is opt-in via env. Without `SENTRY_DSN` (and
`NEXT_PUBLIC_SENTRY_DSN` for the browser), every span helper short-circuits
to the underlying function call with zero overhead — so `pnpm dev`
behaves identically whether you have Sentry credentials or not.

To smoke-test a span you just added without spinning up a Sentry project,
add a `console.log` inside the wrapped callback, hit the route, and
confirm it fires. The actual span timing will only appear in Sentry.

## Verifying instrumentation in CI

There's no automated check that "this route has spans" today. Future:
add a test that imports the route module and asserts the relevant
`traceSpan` calls are present (string match on the source). Low priority
until we've had a regression.
