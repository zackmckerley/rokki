import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isSignalBridgeConfigured,
  bridgeStartLink,
  bridgeSend,
  SignalBridgeError,
  SignalBridgeNotConfiguredError,
} from "./bridge";

/** Build a minimal Response-like stub for the global fetch mock. */
function fetchOk(status: number, body: unknown) {
  return vi.fn(async (_url: string, _init?: RequestInit) => {
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () =>
        typeof body === "string" ? body : JSON.stringify(body),
    } as unknown as Response;
  });
}

const ORIGINAL = {
  url: process.env.SIGNAL_BRIDGE_URL,
  secret: process.env.SIGNAL_BRIDGE_SECRET,
};

beforeEach(() => {
  process.env.SIGNAL_BRIDGE_URL = "https://bridge.example.com/";
  process.env.SIGNAL_BRIDGE_SECRET = "s3cr3t";
});

afterEach(() => {
  process.env.SIGNAL_BRIDGE_URL = ORIGINAL.url;
  process.env.SIGNAL_BRIDGE_SECRET = ORIGINAL.secret;
  vi.unstubAllGlobals();
});

describe("isSignalBridgeConfigured", () => {
  it("is true when both env vars are set", () => {
    expect(isSignalBridgeConfigured()).toBe(true);
  });
  it("is false when either is missing", () => {
    delete process.env.SIGNAL_BRIDGE_SECRET;
    expect(isSignalBridgeConfigured()).toBe(false);
    process.env.SIGNAL_BRIDGE_SECRET = "s3cr3t";
    delete process.env.SIGNAL_BRIDGE_URL;
    expect(isSignalBridgeConfigured()).toBe(false);
  });
});

describe("bridgeStartLink", () => {
  it("throws SignalBridgeNotConfiguredError when env is missing", async () => {
    delete process.env.SIGNAL_BRIDGE_URL;
    await expect(bridgeStartLink("user-1")).rejects.toBeInstanceOf(
      SignalBridgeNotConfiguredError,
    );
  });

  it("trims the trailing slash, sends the secret header, and returns the uri", async () => {
    const fetchMock = fetchOk(200, { uri: "sgnl://linkdevice?uuid=abc" });
    vi.stubGlobal("fetch", fetchMock);

    const out = await bridgeStartLink("user-1");
    expect(out).toEqual({ uri: "sgnl://linkdevice?uuid=abc" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://bridge.example.com/accounts/user-1/link");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers["x-bridge-secret"]).toBe("s3cr3t");
  });

  it("maps a non-2xx response to SignalBridgeError with the bridge's message", async () => {
    vi.stubGlobal("fetch", fetchOk(502, { error: "link ended (1)" }));
    const err = await bridgeStartLink("user-1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SignalBridgeError);
    expect((err as SignalBridgeError).status).toBe(502);
    expect((err as SignalBridgeError).message).toBe("link ended (1)");
  });
});

describe("bridgeSend", () => {
  it("posts the payload as JSON with the content-type header", async () => {
    const fetchMock = fetchOk(200, { ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await bridgeSend("user-1", {
      signalNumber: "+15551234567",
      signalId: "+15557654321",
      kind: "direct",
      text: "hi",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://bridge.example.com/accounts/user-1/send");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual({
      signalNumber: "+15551234567",
      signalId: "+15557654321",
      kind: "direct",
      text: "hi",
    });
  });
});
