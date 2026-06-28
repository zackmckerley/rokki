import { describe, it, expect } from "vitest";
import { groupByStage, isRotting, isFollowUpDue, defaultStageKey } from "./board";
import { HELIOS_PIPELINE } from "./templates";
import type { LeadRow } from "./db";

const stages = HELIOS_PIPELINE.stages;

function lead(over: Partial<LeadRow>): LeadRow {
  return {
    id: "l1",
    pipeline_id: "p1",
    space_id: "s1",
    name: "Deal",
    subtitle: null,
    stage: "tracking",
    status: "open",
    priority: 0,
    source: null,
    owner_id: null,
    next_follow_up_at: null,
    last_activity_at: "2026-06-28T12:00:00Z",
    promoted_terminal_id: null,
    dead_reason: null,
    lat: null,
    lng: null,
    attributes: {},
    created_by: null,
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-28T12:00:00Z",
    ...over,
  };
}

describe("defaultStageKey", () => {
  it("is the first stage", () => {
    expect(defaultStageKey(HELIOS_PIPELINE)).toBe("tracking");
    expect(defaultStageKey({ stages: [] })).toBe("");
  });
});

describe("groupByStage", () => {
  it("places leads in their stage column, in pipeline order", () => {
    const { columns, orphans } = groupByStage(
      [lead({ id: "a", stage: "offer" }), lead({ id: "b", stage: "tracking" })],
      stages,
    );
    expect(columns.map((c) => c.stage.key)).toEqual([
      "tracking", "engaging", "due_diligence", "offer", "under_contract", "active_project", "closed",
    ]);
    expect(columns[0].leads.map((l) => l.id)).toEqual(["b"]);
    expect(columns[3].leads.map((l) => l.id)).toEqual(["a"]);
    expect(orphans).toEqual([]);
  });
  it("collects leads whose stage was removed as orphans", () => {
    const { orphans } = groupByStage([lead({ id: "x", stage: "ghost" })], stages);
    expect(orphans.map((l) => l.id)).toEqual(["x"]);
  });
});

describe("isRotting", () => {
  const now = Date.parse("2026-06-28T12:00:00Z");
  it("flags an open lead idle past its stage rotting_days", () => {
    // tracking = 30d. 40 days idle → rotting.
    expect(isRotting(lead({ stage: "tracking", last_activity_at: "2026-05-19T12:00:00Z" }), stages, now)).toBe(true);
  });
  it("is false within the window", () => {
    expect(isRotting(lead({ stage: "tracking", last_activity_at: "2026-06-20T12:00:00Z" }), stages, now)).toBe(false);
  });
  it("is false for non-open leads", () => {
    expect(isRotting(lead({ status: "won", last_activity_at: "2026-01-01T00:00:00Z" }), stages, now)).toBe(false);
  });
  it("is false for a stage with no rotting_days", () => {
    expect(isRotting(lead({ stage: "active_project", last_activity_at: "2020-01-01T00:00:00Z" }), stages, now)).toBe(false);
  });
});

describe("isFollowUpDue", () => {
  const now = Date.parse("2026-06-28T12:00:00Z");
  it("is due when next_follow_up_at is past and lead is open", () => {
    expect(isFollowUpDue(lead({ next_follow_up_at: "2026-06-27T00:00:00Z" }), now)).toBe(true);
  });
  it("not due in the future", () => {
    expect(isFollowUpDue(lead({ next_follow_up_at: "2026-06-29T00:00:00Z" }), now)).toBe(false);
  });
  it("not due without a date or when not open", () => {
    expect(isFollowUpDue(lead({ next_follow_up_at: null }), now)).toBe(false);
    expect(isFollowUpDue(lead({ status: "dead", next_follow_up_at: "2026-06-27T00:00:00Z" }), now)).toBe(false);
  });
});
