/**
 * Server-only client for the Signal bridge (apps/signal-bridge, deployed to
 * Fly.io). The bridge holds the signal-cli session and the Supabase
 * service-role key; Rokki talks to it over HTTPS, authenticated by a shared
 * secret (`x-bridge-secret`).
 *
 * NEVER import this from a client component — SIGNAL_BRIDGE_SECRET must stay
 * on the server. The Connect-Signal UI talks to our own /api/v1/signal/*
 * routes, which in turn call this helper.
 */

export class SignalBridgeNotConfiguredError extends Error {
  constructor() {
    super("Signal bridge is not configured");
    this.name = "SignalBridgeNotConfiguredError";
  }
}

export class SignalBridgeError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "SignalBridgeError";
    this.status = status;
  }
}

/** True when both bridge env vars are present (drives the UI's "configured"
 *  state without leaking the values). */
export function isSignalBridgeConfigured(): boolean {
  return Boolean(
    process.env.SIGNAL_BRIDGE_URL && process.env.SIGNAL_BRIDGE_SECRET,
  );
}

function config(): { url: string; secret: string } {
  const url = process.env.SIGNAL_BRIDGE_URL;
  const secret = process.env.SIGNAL_BRIDGE_SECRET;
  if (!url || !secret) throw new SignalBridgeNotConfiguredError();
  return { url: url.replace(/\/+$/, ""), secret };
}

async function bridgeFetch<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; timeoutMs?: number },
): Promise<T> {
  const { url, secret } = config();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 15_000);
  try {
    const res = await fetch(`${url}${path}`, {
      method: init.method,
      headers: {
        "x-bridge-secret": secret,
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await res.text();
    const data: unknown = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const msg =
        (data as { error?: string } | null)?.error ?? `bridge ${res.status}`;
      throw new SignalBridgeError(res.status, msg);
    }
    return data as T;
  } catch (e) {
    if (e instanceof SignalBridgeError) throw e;
    if (e instanceof Error && e.name === "AbortError") {
      throw new SignalBridgeError(504, "Signal bridge timed out");
    }
    throw new SignalBridgeError(
      502,
      e instanceof Error ? e.message : "Signal bridge unreachable",
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Start linking this user's Signal account as a secondary device. Resolves
 * with the `sgnl://linkdevice?...` URI to render as a QR for the Signal app
 * to scan. (signal-cli spins up a JVM and emits the URI, so allow extra time.)
 */
export function bridgeStartLink(userId: string): Promise<{ uri: string }> {
  return bridgeFetch<{ uri: string }>(
    `/accounts/${encodeURIComponent(userId)}/link`,
    { method: "POST", timeoutMs: 55_000 },
  );
}

/** Send a message on the user's behalf through their linked Signal account. */
export function bridgeSend(
  userId: string,
  payload: {
    signalNumber: string;
    signalId: string;
    kind: "direct" | "group";
    text: string;
  },
): Promise<{ ok: true }> {
  return bridgeFetch<{ ok: true }>(
    `/accounts/${encodeURIComponent(userId)}/send`,
    { method: "POST", body: payload },
  );
}
