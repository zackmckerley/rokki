import { describe, expect, it } from "vitest";
import { TASK_PRIORITY_FROM_INT, TASK_PRIORITY_TO_INT } from "@rokki/db";

/**
 * The priority mapping is the bridge between the friendly UI enum and the
 * SMALLINT (1..4) we keep in the DB so existing indexes/queries don't have
 * to migrate. If these two get out of sync we'll silently mis-rank tasks.
 */
describe("task priority mapping", () => {
  it("round-trips low/medium/high/urgent through the int representation", () => {
    for (const name of ["urgent", "high", "medium", "low"] as const) {
      const n = TASK_PRIORITY_TO_INT[name];
      expect(TASK_PRIORITY_FROM_INT[n]).toBe(name);
    }
  });

  it("sorts urgent first, low last (matches ORDER BY priority ASC in API)", () => {
    const names = (["low", "urgent", "medium", "high"] as const)
      .slice()
      .sort((a, b) => TASK_PRIORITY_TO_INT[a] - TASK_PRIORITY_TO_INT[b]);
    expect(names).toEqual(["urgent", "high", "medium", "low"]);
  });

  it("uses 3 (medium) as the default — must match the SMALLINT DEFAULT in the DB", () => {
    expect(TASK_PRIORITY_TO_INT.medium).toBe(3);
  });
});
