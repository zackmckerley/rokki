import { describe, expect, it } from "vitest";
import { summarizeActivity } from "./activity-summary";

describe("summarizeActivity", () => {
  describe("dotted app-emitted actions", () => {
    it("renders task.create with the title", () => {
      expect(
        summarizeActivity({
          action: "task.create",
          metadata: { title: "Pour the slab" },
        }),
      ).toBe("task created: Pour the slab");
    });

    it("falls back to (untitled) when title missing", () => {
      expect(summarizeActivity({ action: "task.create", metadata: {} })).toBe(
        "task created: (untitled)",
      );
    });

    it("renders terminal.create with the name", () => {
      expect(
        summarizeActivity({
          action: "terminal.create",
          metadata: { name: "HELIOS" },
        }),
      ).toBe("new terminal: HELIOS");
    });

    it("renders task.complete + task.delete + task.assigned", () => {
      expect(
        summarizeActivity({
          action: "task.complete",
          metadata: { title: "Build deck" },
        }),
      ).toBe("completed: Build deck");
      expect(
        summarizeActivity({
          action: "task.delete",
          metadata: { title: "Old plan" },
        }),
      ).toBe("task deleted: Old plan");
      expect(
        summarizeActivity({
          action: "task.assigned",
          metadata: { title: "Site visit" },
        }),
      ).toBe("assigned: Site visit");
    });
  });

  describe("plural underscored trigger actions (the original bug)", () => {
    it("handles tasks_updated without a diff", () => {
      // Pre-fix: this fell through `replace(/[._]/g, " ")` →
      // "tasks updated", which is exactly what Zack reported.
      expect(
        summarizeActivity({
          action: "tasks_updated",
          metadata: { title: "Pour slab" },
        }),
      ).toBe("task updated: Pour slab");
    });

    it("handles terminals_updated", () => {
      expect(
        summarizeActivity({
          action: "terminals_updated",
          metadata: { name: "HELIOS" },
        }),
      ).toBe("HELIOS updated");
    });

    it("handles spaces_updated, files_updated, comments_updated", () => {
      expect(
        summarizeActivity({ action: "spaces_updated", metadata: {} }),
      ).toBe("space updated:");
      expect(
        summarizeActivity({
          action: "files_updated",
          metadata: { filename: "spec.pdf" },
        }),
      ).toBe("file updated: spec.pdf");
      expect(
        summarizeActivity({ action: "comments_updated", metadata: {} }),
      ).toBe("comment edited");
    });
  });

  describe("field-level diffs from before/after", () => {
    it("renders priority change (Medium → High)", () => {
      const text = summarizeActivity({
        action: "tasks_updated",
        before_json: { title: "Pour slab", priority: 2, status: "todo" },
        after_json: { title: "Pour slab", priority: 1, status: "todo" },
      });
      expect(text).toBe("Pour slab: priority: Medium → High");
    });

    it("renders status change (Todo → Done)", () => {
      const text = summarizeActivity({
        action: "tasks_updated",
        before_json: { title: "Pour slab", status: "todo", priority: 2 },
        after_json: { title: "Pour slab", status: "done", priority: 2 },
      });
      expect(text).toBe("Pour slab: status: To do → Done");
    });

    it("renders multi-field diff with separator", () => {
      const text = summarizeActivity({
        action: "tasks_updated",
        before_json: {
          title: "Old",
          status: "todo",
          priority: 3,
          due_date: null,
        },
        after_json: {
          title: "New",
          status: "in_progress",
          priority: 1,
          due_date: "2026-05-15",
        },
      });
      expect(text).toContain("title: Old → New");
      expect(text).toContain("status: To do → In progress");
      expect(text).toContain("priority: Low → High");
      expect(text).toContain("due: — → 2026-05-15");
      expect(text).toContain(" · ");
    });

    it("renders + N more when off-list fields also changed", () => {
      const text = summarizeActivity({
        action: "tasks_updated",
        before_json: {
          title: "X",
          priority: 2,
          recurrence_rule: { freq: "daily" },
        },
        after_json: {
          title: "X",
          priority: 1,
          recurrence_rule: { freq: "weekly" },
        },
      });
      expect(text).toMatch(/priority: Medium → High/);
      expect(text).toMatch(/\+1 more change/);
    });

    it("ignores noise columns (updated_at, position, ticker_seq)", () => {
      // These shouldn't fire the diff — if they did the chip would
      // light up on every save with no real user-facing change.
      const text = summarizeActivity({
        action: "tasks_updated",
        before_json: {
          title: "Stable",
          priority: 1,
          updated_at: "2026-05-01T00:00:00Z",
          position: 1000,
          ticker_seq: 5,
        },
        after_json: {
          title: "Stable",
          priority: 1,
          updated_at: "2026-05-02T00:00:00Z",
          position: 2000,
          ticker_seq: 5,
        },
      });
      expect(text).toBe("task updated: Stable");
    });

    it("falls back to plain 'task updated' when before/after match", () => {
      const text = summarizeActivity({
        action: "tasks_updated",
        before_json: { title: "Same", priority: 1 },
        after_json: { title: "Same", priority: 1 },
      });
      expect(text).toBe("task updated: Same");
    });

    it("handles null priority (no priority sentinel)", () => {
      const text = summarizeActivity({
        action: "tasks_updated",
        before_json: { title: "X", priority: null },
        after_json: { title: "X", priority: 1 },
      });
      expect(text).toBe("X: priority: None → High");
    });
  });

  describe("file actions", () => {
    it("renders file.upload", () => {
      expect(
        summarizeActivity({
          action: "file.upload",
          metadata: { filename: "plans.pdf" },
        }),
      ).toBe("uploaded plans.pdf");
    });

    it("renders folder.create via op metadata", () => {
      expect(
        summarizeActivity({
          action: "file.upload",
          metadata: { op: "folder.create", path: "drawings/" },
        }),
      ).toBe("folder: drawings/");
    });

    it("renders file_updated singular", () => {
      expect(
        summarizeActivity({
          action: "file_updated",
          metadata: { filename: "spec.pdf" },
        }),
      ).toBe("file updated: spec.pdf");
    });
  });

  describe("members + comments", () => {
    it("renders member.invite + member.join", () => {
      expect(
        summarizeActivity({
          action: "member.invite",
          metadata: { email: "ann@example.com" },
        }),
      ).toBe("invited ann@example.com");
      expect(
        summarizeActivity({
          action: "member.join",
          metadata: { name: "Ann" },
        }),
      ).toBe("Ann joined");
    });

    it("renders comment.create with entity_kind", () => {
      expect(
        summarizeActivity({
          action: "comment.create",
          metadata: { entity_kind: "task" },
        }),
      ).toBe("commented on task");
    });
  });

  describe("unknown actions", () => {
    it("falls back to humanized action name", () => {
      // An action we never see in practice but might emit in the
      // future. The fallback should still produce a readable chip.
      expect(
        summarizeActivity({
          action: "shiny_new_kind",
          metadata: {},
        }),
      ).toBe("shiny new kind");
    });
  });
});
