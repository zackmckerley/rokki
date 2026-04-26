import { describe, expect, it } from "vitest";
import { createRokkiClient, isErr, isOk } from "./index.js";

describe("createRokkiClient", () => {
  it("constructs with all expected resources", () => {
    const client = createRokkiClient({
      baseUrl: "https://example.invalid",
      apiKey: "rk_live_test",
    });
    expect(client.health.check).toBeTypeOf("function");
    expect(client.tasks.list).toBeTypeOf("function");
    expect(client.tools.invoke).toBeTypeOf("function");
    expect(client.spaces.create).toBeTypeOf("function");
  });

  it("requires a baseUrl", () => {
    expect(() =>
      // @ts-expect-error intentional bad call
      createRokkiClient({}),
    ).toThrow();
  });

  it("returns an error envelope on a failed network request", async () => {
    const client = createRokkiClient({
      baseUrl: "http://127.0.0.1:1", // closed port
      apiKey: "rk_live_test",
      timeoutMs: 200,
    });
    const r = await client.health.check();
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.errors[0]?.code).toBe("internal_error");
    expect(isOk(r)).toBe(false);
  });
});
