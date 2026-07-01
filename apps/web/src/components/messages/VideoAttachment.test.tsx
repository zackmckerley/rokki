// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { posterSrc, isGifLike, VideoAttachment } from "./VideoAttachment";

describe("posterSrc", () => {
  it("appends #t=0.1 so the first frame paints as a poster", () => {
    expect(posterSrc("https://x/v.mp4")).toBe("https://x/v.mp4#t=0.1");
  });
  it("preserves a signed-URL query string (fragment is client-only)", () => {
    expect(posterSrc("https://x/v.mp4?token=abc")).toBe(
      "https://x/v.mp4?token=abc#t=0.1",
    );
  });
  it("does not double-append when a fragment already exists", () => {
    expect(posterSrc("https://x/v.mp4#t=5")).toBe("https://x/v.mp4#t=5");
  });
});

describe("isGifLike", () => {
  it("true for image/gif and video/gif content types", () => {
    expect(isGifLike("image/gif", "a.mp4")).toBe(true);
    expect(isGifLike("video/gif", null)).toBe(true);
  });
  it("true for a .gif filename even under a video content type", () => {
    expect(isGifLike("video/mp4", "funny.gif")).toBe(true);
  });
  it("false for a normal video", () => {
    expect(isGifLike("video/mp4", "clip.mp4")).toBe(false);
    expect(isGifLike(null, null)).toBe(false);
  });
});

describe("VideoAttachment", () => {
  it("auto-loops a GIF (muted, looping, no controls)", () => {
    const { container } = render(
      <VideoAttachment url="https://x/g.mp4" contentType="video/mp4" filename="a.gif" />,
    );
    const v = container.querySelector("video") as HTMLVideoElement;
    expect(v.loop).toBe(true);
    expect(v.muted).toBe(true);
    expect(v.autoplay).toBe(true);
    expect(v.controls).toBe(false);
    expect(v.getAttribute("src")).toContain("#t=0.1");
  });
  it("a normal video gets controls + a poster frame", () => {
    const { container } = render(
      <VideoAttachment url="https://x/v.mp4" contentType="video/mp4" filename="clip.mp4" />,
    );
    const v = container.querySelector("video") as HTMLVideoElement;
    expect(v.controls).toBe(true);
    expect(v.loop).toBe(false);
    expect(v.getAttribute("src")).toBe("https://x/v.mp4#t=0.1");
  });
});
