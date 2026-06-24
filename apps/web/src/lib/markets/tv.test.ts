import { describe, it, expect, afterEach, vi } from "vitest";

// tv.ts is server-only; stub the marker so it imports under vitest.
vi.mock("server-only", () => ({}));

import { tvAvailable, findChannel, resolveLiveVideoId, type TvChannel } from "./tv";

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

function ch(handle: string): TvChannel {
  return { id: handle, name: handle, handle, attribution: "" };
}

/** Mock that answers both calls: /channels (handle→id) and /search (live). */
function ytMock(searchBody: unknown, channelsBody?: unknown) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/channels")) {
      if (channelsBody) return jsonRes(channelsBody);
      const handle = new URL(url).searchParams.get("forHandle") ?? "x";
      return jsonRes({ items: [{ id: `UC_${handle}` }] });
    }
    return jsonRes(searchBody);
  });
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
  it("finds bloomberg (Bloomberg Television, @markets) and is undefined for unknown", () => {
    const c = findChannel("bloomberg");
    expect(c?.name).toBe("Bloomberg Television");
    expect(c?.handle).toBe("markets");
    expect(findChannel("nope")).toBeUndefined();
  });
});

describe("resolveLiveVideoId", () => {
  it("resolves the channel by handle then extracts + caches the live id", async () => {
    process.env.YOUTUBE_API_KEY = "k";
    const fetchMock = ytMock({ items: [{ id: { videoId: "LIVEvid1234" } }] });
    vi.stubGlobal("fetch", fetchMock);
    expect(await resolveLiveVideoId(ch("h_extract"))).toBe("LIVEvid1234");
    expect(fetchMock).toHaveBeenCalledTimes(2); // channels + search
    // Second call: both lookups cached → no new fetches.
    expect(await resolveLiveVideoId(ch("h_extract"))).toBe("LIVEvid1234");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a malformed video id (wrong length / chars)", async () => {
    process.env.YOUTUBE_API_KEY = "k";
    vi.stubGlobal("fetch", ytMock({ items: [{ id: { videoId: "not a real id!" } }] }));
    expect(await resolveLiveVideoId(ch("h_bad"))).toBeNull();
  });

  it("returns null when the channel isn't live", async () => {
    process.env.YOUTUBE_API_KEY = "k";
    vi.stubGlobal("fetch", ytMock({ items: [] }));
    expect(await resolveLiveVideoId(ch("h_notlive"))).toBeNull();
  });

  it("returns null when the handle can't be resolved", async () => {
    process.env.YOUTUBE_API_KEY = "k";
    vi.stubGlobal(
      "fetch",
      ytMock({ items: [{ id: { videoId: "LIVEvid1234" } }] }, { items: [] }),
    );
    expect(await resolveLiveVideoId(ch("h_missing"))).toBeNull();
  });

  it("throws when no key is configured", async () => {
    delete process.env.YOUTUBE_API_KEY;
    await expect(resolveLiveVideoId(ch("h_nokey"))).rejects.toThrow(
      /not configured/,
    );
  });
});
