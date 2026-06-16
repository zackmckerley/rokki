/**
 * Shared outbound HTTP helper for market-data providers.
 *
 * Mirrors the timeout/error conventions of `lib/signal/bridge.ts`:
 * AbortController timeout, `cache: "no-store"`, a typed error class so
 * callers can distinguish upstream failures from bugs. Server-only — these
 * calls carry provider API keys and must never run in the browser.
 */
import "server-only";

export class MarketDataError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly provider?: string,
  ) {
    super(message);
    this.name = "MarketDataError";
  }
}

/**
 * GET a URL and parse JSON, with a hard timeout. Throws MarketDataError on
 * non-2xx or network failure so the route layer can map it to `upstream_error`.
 */
export async function fetchJson<T>(
  url: string,
  opts: { timeoutMs?: number; provider?: string } = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    const text = await res.text();
    let data: unknown = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new MarketDataError(
        502,
        `Non-JSON response from ${opts.provider ?? "provider"}`,
        opts.provider,
      );
    }
    if (!res.ok) {
      const msg =
        (data as { error?: string; message?: string } | null)?.error ??
        (data as { message?: string } | null)?.message ??
        `HTTP ${res.status}`;
      throw new MarketDataError(res.status, msg, opts.provider);
    }
    return data as T;
  } catch (e) {
    if (e instanceof MarketDataError) throw e;
    if (e instanceof Error && e.name === "AbortError") {
      throw new MarketDataError(504, "Provider request timed out", opts.provider);
    }
    throw new MarketDataError(
      502,
      e instanceof Error ? e.message : "Provider unreachable",
      opts.provider,
    );
  } finally {
    clearTimeout(timer);
  }
}

/** True when the provider's API key env var is present. */
export function hasKey(envVar: string): boolean {
  return Boolean(process.env[envVar]);
}

export function requireKey(envVar: string, provider: string): string {
  const v = process.env[envVar];
  if (!v) {
    throw new MarketDataError(
      503,
      `${provider} not configured — ${envVar} is missing`,
      provider,
    );
  }
  return v;
}
