import { describe, it, expect } from "vitest";
import { hasScope } from "./api-auth";

describe("hasScope", () => {
  it("read scope can read but not write/admin", () => {
    const b = { scopes: ["read"] };
    expect(hasScope(b, "read")).toBe(true);
    expect(hasScope(b, "write")).toBe(false);
    expect(hasScope(b, "admin")).toBe(false);
  });
  it("write scope implies read but not admin", () => {
    const b = { scopes: ["write"] };
    expect(hasScope(b, "read")).toBe(true);
    expect(hasScope(b, "write")).toBe(true);
    expect(hasScope(b, "admin")).toBe(false);
  });
  it("admin scope grants everything", () => {
    const b = { scopes: ["admin"] };
    expect(hasScope(b, "read")).toBe(true);
    expect(hasScope(b, "write")).toBe(true);
    expect(hasScope(b, "admin")).toBe(true);
  });
  it("empty / missing scopes grant nothing", () => {
    expect(hasScope({ scopes: [] }, "read")).toBe(false);
    expect(hasScope({ scopes: [] }, "write")).toBe(false);
    // @ts-expect-error — exercise the ?? [] guard
    expect(hasScope({ scopes: undefined }, "read")).toBe(false);
  });
});
