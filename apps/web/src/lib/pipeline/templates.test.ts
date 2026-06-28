import { describe, it, expect } from "vitest";
import {
  HELIOS_PIPELINE,
  PIPELINE_TEMPLATES,
  DEFAULT_PIPELINE,
  terminalGateStage,
} from "./templates";

describe("pipeline templates", () => {
  it("HELIOS flow: Tracking → … → Closed, with Under Contract as the terminal gate", () => {
    const keys = HELIOS_PIPELINE.stages.map((s) => s.key);
    expect(keys).toEqual([
      "tracking",
      "engaging",
      "due_diligence",
      "offer",
      "under_contract",
      "active_project",
      "closed",
    ]);
    // "Dead" is a status, never a stage.
    expect(keys).not.toContain("dead");
    const gate = terminalGateStage(HELIOS_PIPELINE.stages);
    expect(gate?.key).toBe("under_contract");
    // exactly one terminal gate
    expect(HELIOS_PIPELINE.stages.filter((s) => s.is_terminal_gate)).toHaveLength(1);
    // Closed is the won outcome
    expect(HELIOS_PIPELINE.stages.at(-1)?.type).toBe("won");
  });

  it("every template has stages + a unique kind, and the default is HELIOS", () => {
    expect(DEFAULT_PIPELINE).toBe(HELIOS_PIPELINE);
    const kinds = PIPELINE_TEMPLATES.map((t) => t.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    for (const t of PIPELINE_TEMPLATES) {
      expect(t.stages.length).toBeGreaterThan(1);
      expect(t.stages.some((s) => s.type === "won")).toBe(true);
    }
  });

  it("terminalGateStage returns null when no stage is the gate", () => {
    expect(
      terminalGateStage([{ key: "a", label: "A", type: "open" }]),
    ).toBeNull();
  });
});
