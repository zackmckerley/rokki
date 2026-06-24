import { describe, it, expect, afterEach, vi } from "vitest";

// tv.ts is server-only; stub the marker so it imports under vitest.
vi.mock("server-only", () => ({}));

import { tvAvailable, findChannel, resolveLiveVideoId } from "./tv";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.YOUTUBE_API_KEY;
});

function jsonRes(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("tvAvailable", () => {
  it("reflects YOUTUBE_API_KEY", () => {
    delete process.env.YOUTUBE_API_KEY;
    expect(tvAvailable()).toBe(false);
    process.env.YOUTUBE_API_KEY = "k";
    expect(tvAvailable()).toBe(true);
  });
});

describe("findChannel", () => {
  it("finds bloomberg and is undefined for unknown ids", () => {
    expect(findChannel("bloomberg")?.name).toBe("Bloomberg TV");
    expect(findChannel("nope")).toBeUndefined();
  });
});

describe("resolveLiveVideoId", () => {
  it("extracts the live video id (11-char) and caches it", async () => {
    process.env.YOUTUBE_API_KEY = "k";
    const fetchMock = vi.fn(async () =>
      jsonRes({ items: [{ id: { videoId: "LIVEvid1234" } }] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await resolveLiveVideoId("UC_cacheA")).toBe("LIVEvid1234");
    expect(await resolveLiveVideoId("UC_cacheA")).toBe("LIVEvid1234"); // cached
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a malformed video id (wrong length / chars)", async () => {
    process.env.YOUTUBE_API_KEY = "k";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonRes({ items: [{ id: { videoId: "not a real id!" } }] })),
    );
    expect(await resolveLiveVideoId("UC_cacheBad")).toBeNull();
  });

  it("returns null when the channel isn't live", async () => {
    process.env.YOUTUBE_API_KEY = "k";
    vi.stubGlobal("fetch", vi.fn(async () => jsonRes({ items: [] })));
    expect(await resolveLiveVideoId("UC_cacheB")).toBeNull();
  });

  it("throws when no key is configured", async () => {
    delete process.env.YOUTUBE_API_KEY;
    await expect(resolveLiveVideoId("UC_cacheC")).rejects.toThrow(/not configured/);
  });
});
