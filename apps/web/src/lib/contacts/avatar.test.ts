import { describe, it, expect } from "vitest";
import { imageExtFromType, avatarStorageKey, AVATAR_BUCKET } from "./avatar";

describe("imageExtFromType", () => {
  it("maps accepted image types to extensions", () => {
    expect(imageExtFromType("image/jpeg")).toBe("jpg");
    expect(imageExtFromType("image/jpg")).toBe("jpg");
    expect(imageExtFromType("image/png")).toBe("png");
    expect(imageExtFromType("image/webp")).toBe("webp");
    expect(imageExtFromType("image/gif")).toBe("gif");
    expect(imageExtFromType("image/heic")).toBe("heic");
  });

  it("tolerates charset params and casing", () => {
    expect(imageExtFromType("IMAGE/PNG")).toBe("png");
    expect(imageExtFromType("image/jpeg; charset=binary")).toBe("jpg");
  });

  it("rejects non-image and empty types", () => {
    expect(imageExtFromType("application/pdf")).toBeNull();
    expect(imageExtFromType("text/html")).toBeNull();
    expect(imageExtFromType("")).toBeNull();
    expect(imageExtFromType(null)).toBeNull();
    expect(imageExtFromType(undefined)).toBeNull();
  });
});

describe("avatarStorageKey", () => {
  it("pins the key under the owner's user-id segment (RLS depends on it)", () => {
    const key = avatarStorageKey("user-123", "abc-def", "png");
    expect(key).toBe("user-123/abc-def.png");
    // The first path segment must be exactly the user id — that's what the
    // contact-avatars write policy checks via storage.foldername(name)[1].
    expect(key.split("/")[0]).toBe("user-123");
  });

  it("uses a stable bucket name", () => {
    expect(AVATAR_BUCKET).toBe("contact-avatars");
  });
});
