/**
 * Structured logger that bridges to Sentry (errors) and Axiom (events).
 * Both integrations are opt-in via env. Without keys, everything degrades
 * to `console.*` — no runtime errors, no missed messages.
 *
 * Used from server code (route handlers, server components, the indexer).
 * Client-side Sentry is wired via `@sentry/nextjs` config files (sentry.*.config.ts)
 * if the user opts in; this logger is server-only.
 *
 * Philosophy: structured events > strings. Every call takes a message
 * label + a `fields` object so Axiom queries can filter by dimension.
 */

interface Fields {
  [key: string]: unknown;
}

const SENTRY_DSN = process.env.SENTRY_DSN ?? "";
const AXIOM_TOKEN = process.env.AXIOM_TOKEN ?? "";
const AXIOM_DATASET = process.env.AXIOM_DATASET ?? "rokki-web";
const ENV = process.env.NODE_ENV ?? "development";

interface SentryLike {
  init: (opts: { dsn: string; environment?: string }) => void;
  captureException: (err: unknown, ctx?: { extra?: unknown }) => void;
}
let sentry: SentryLike | null = null;
async function loadSentry(): Promise<void> {
  if (!SENTRY_DSN || sentry) return;
  try {
    // Variable import so the TS compiler doesn't require the optional peer
    // dependency. If the package isn't installed we just stay on console.
    const name = "@sentry/nextjs";
    const mod = (await import(/* @vite-ignore */ name)) as unknown as SentryLike;
    sentry = mod;
    sentry.init({ dsn: SENTRY_DSN, environment: ENV });
  } catch {
    // Not installed — stay on console.
  }
}

/**
 * Fire-and-forget POST to Axiom's ingest endpoint. Falls back to
 * `console.log` when the token isn't set.
 */
async function shipToAxiom(event: Record<string, unknown>): Promise<void> {
  if (!AXIOM_TOKEN) return;
  try {
    await fetch(
      `https://api.axiom.co/v1/datasets/${encodeURIComponent(AXIOM_DATASET)}/ingest`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${AXIOM_TOKEN}`,
        },
        body: JSON.stringify([event]),
        // Run as background; don't block the response path.
        keepalive: true,
      },
    );
  } catch {
    // Swallow — observability should never break the main path.
  }
}

function fmt(fields: Fields): string {
  try {
    return JSON.stringify(fields);
  } catch {
    return "[unserializable]";
  }
}

export const log = {
  info(message: string, fields: Fields = {}): void {
    console.log(`[info] ${message} ${fmt(fields)}`);
    void shipToAxiom({ level: "info", message, env: ENV, ...fields });
  },

  warn(message: string, fields: Fields = {}): void {
    console.warn(`[warn] ${message} ${fmt(fields)}`);
    void shipToAxiom({ level: "warn", message, env: ENV, ...fields });
  },

  error(message: string, error?: unknown, fields: Fields = {}): void {
    const err = error instanceof Error ? error : new Error(String(error ?? message));
    console.error(`[error] ${message}`, err, fmt(fields));
    void shipToAxiom({
      level: "error",
      message,
      env: ENV,
      error: err.message,
      stack: err.stack,
      ...fields,
    });
    // Fire-and-forget Sentry ship.
    if (SENTRY_DSN) {
      void loadSentry().then(() => {
        sentry?.captureException(err, { extra: fields });
      });
    }
  },
};
