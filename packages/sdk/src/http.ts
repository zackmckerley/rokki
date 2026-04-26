import type { ApiError, ErrorResponse, Result } from "./types.js";

/**
 * Configuration for the SDK client.
 *
 * Auth modes:
 *   - Browser: omit `apiKey`. The SDK calls fetch with `credentials: "include"`
 *     so the Supabase session cookie travels along.
 *   - Programmatic (CLI / SDK / MCP): pass `apiKey: "rk_live_…"`. The SDK
 *     attaches `Authorization: Bearer <key>` to every request.
 */
export interface RokkiClientConfig {
  /** Absolute base URL, e.g. "https://rokki.ai" or "http://localhost:3000". */
  baseUrl: string;
  /**
   * Personal access token (rk_live_… or rk_test_…). Optional — when omitted
   * the client falls back to cookie auth. Required for non-browser callers.
   */
  apiKey?: string;
  /**
   * Custom fetch implementation. Defaults to globalThis.fetch (Node 18+,
   * Bun, Deno, Workers, browsers).
   */
  fetch?: typeof globalThis.fetch;
  /** Request timeout in ms. Default 30s. */
  timeoutMs?: number;
  /** Optional override for User-Agent. */
  userAgent?: string;
}

export interface RokkiHttpClient {
  request<T>(
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
    path: string,
    options?: { query?: Record<string, string | number | undefined>; body?: unknown },
  ): Promise<Result<T>>;
}

const DEFAULT_TIMEOUT = 30_000;

/**
 * Build a fetch-based HTTP client. Hides retry, auth, error-envelope
 * normalization. Each call returns `{ data }` or `{ errors }` — no thrown
 * exceptions for normal API errors.
 *
 * Network failures and JSON parse errors are surfaced as a synthetic
 * `internal_error` envelope so callers don't have to wrap every call in
 * try/catch.
 */
export function createHttpClient(config: RokkiClientConfig): RokkiHttpClient {
  if (!config.baseUrl) throw new Error("RokkiClient: baseUrl is required");
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  const doFetch = config.fetch ?? globalThis.fetch;
  if (typeof doFetch !== "function") {
    throw new Error(
      "RokkiClient: no fetch implementation found. Pass `fetch` in config.",
    );
  }
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT;

  return {
    async request<T>(
      method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
      path: string,
      options: {
        query?: Record<string, string | number | undefined>;
        body?: unknown;
      } = {},
    ): Promise<Result<T>> {
      const url = new URL(baseUrl + path);
      if (options.query) {
        for (const [k, v] of Object.entries(options.query)) {
          if (v !== undefined && v !== null) {
            url.searchParams.set(k, String(v));
          }
        }
      }

      const headers: Record<string, string> = {
        accept: "application/json",
      };
      if (config.apiKey) {
        headers["authorization"] = `Bearer ${config.apiKey}`;
      }
      if (config.userAgent) {
        headers["user-agent"] = config.userAgent;
      } else {
        headers["user-agent"] = "@rokki/sdk";
      }

      let body: BodyInit | undefined;
      if (options.body !== undefined) {
        if (
          typeof options.body === "object" &&
          options.body !== null &&
          (options.body instanceof FormData ||
            options.body instanceof Blob ||
            options.body instanceof ArrayBuffer)
        ) {
          body = options.body as BodyInit;
        } else {
          body = JSON.stringify(options.body);
          headers["content-type"] = "application/json";
        }
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let res: Response;
      try {
        res = await doFetch(url.toString(), {
          method,
          headers,
          body,
          credentials: config.apiKey ? "omit" : "include",
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        return {
          errors: [
            {
              code: "internal_error",
              message:
                err instanceof Error ? err.message : "network failure",
            },
          ],
        };
      }
      clearTimeout(timer);

      // 204 No Content
      if (res.status === 204) {
        return { data: undefined as T };
      }

      const text = await res.text();
      let parsed: unknown = null;
      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch {
          return {
            errors: [
              {
                code: "internal_error",
                message: `Non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}`,
              },
            ],
          };
        }
      }

      if (!res.ok) {
        const errResp = parsed as ErrorResponse | null;
        const errors: ApiError[] = errResp?.errors?.length
          ? errResp.errors
          : [
              {
                code: "internal_error",
                message: `HTTP ${res.status}`,
              },
            ];
        return { errors };
      }

      // Successful responses are wrapped in `{ data: ... }` per the
      // Rokki convention. A handful of endpoints return raw data — we
      // surface that directly.
      if (
        parsed &&
        typeof parsed === "object" &&
        "data" in (parsed as Record<string, unknown>)
      ) {
        return { data: (parsed as { data: T }).data };
      }
      return { data: parsed as T };
    },
  };
}

/** Type guard: SDK methods return `{ data }` on success. */
export function isOk<T>(r: Result<T>): r is { data: T } {
  return "data" in r;
}

/** Type guard: SDK methods return `{ errors }` on failure. */
export function isErr<T>(r: Result<T>): r is { errors: ApiError[] } {
  return "errors" in r;
}
