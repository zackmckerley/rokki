import { describe, it, expect } from "vitest";
import {
  describeSignalStatus,
  toneTextClass,
  type SignalTone,
} from "./status";

describe("describeSignalStatus", () => {
  it("maps active → connected/positive", () => {
    const v = describeSignalStatus("active");
    expect(v).toEqual({ label: "Connected", tone: "positive", connected: true });
  });

  it("maps linking → waiting/warning, not connected", () => {
    const v = describeSignalStatus("linking");
    expect(v.connected).toBe(false);
    expect(v.tone).toBe("warning");
    expect(v.label).toMatch(/scan/i);
  });

  it("maps error → danger, not connected", () => {
    const v = describeSignalStatus("error");
    expect(v).toEqual({
      label: "Connection error",
      tone: "danger",
      connected: false,
    });
  });

  it("treats unlinked, null, undefined, and junk as not connected", () => {
    for (const s of ["unlinked", null, undefined, "wat"]) {
      const v = describeSignalStatus(s);
      expect(v.connected).toBe(false);
      expect(v.tone).toBe("muted");
      expect(v.label).toBe("Not connected");
    }
  });
});

describe("toneTextClass", () => {
  it("returns a real token for every tone", () => {
    const tones: SignalTone[] = ["positive", "warning", "danger", "muted"];
    for (const t of tones) expect(toneTextClass(t)).toMatch(/^text-/);
  });

  it("maps positive → success and danger → danger", () => {
    expect(toneTextClass("positive")).toBe("text-success");
    expect(toneTextClass("danger")).toBe("text-danger");
    expect(toneTextClass("warning")).toBe("text-warning");
    expect(toneTextClass("muted")).toBe("text-text-3");
  });
});
