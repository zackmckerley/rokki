import { describe, it, expect } from "vitest";
import { extFromName, leadFileKey, LEAD_FILES_BUCKET } from "./leadfiles";

describe("extFromName", () => {
  it("pulls the extension", () => {
    expect(extFromName("Offering Memo.pdf")).toBe("pdf");
    expect(extFromName("survey.DWG")).toBe("dwg");
    expect(extFromName("photo.jpeg")).toBe("jpeg");
  });
  it("falls back to bin when there's no extension", () => {
    expect(extFromName("README")).toBe("bin");
    expect(extFromName("")).toBe("bin");
  });
});

describe("leadFileKey", () => {
  it("pins the key under the uploader's user-id segment", () => {
    const key = leadFileKey("user-1", "lead-9", "abc", "pdf");
    expect(key).toBe("user-1/lead-9/abc.pdf");
    expect(key.split("/")[0]).toBe("user-1"); // RLS depends on this prefix
  });
  it("uses a stable bucket name", () => {
    expect(LEAD_FILES_BUCKET).toBe("lead-files");
  });
});
