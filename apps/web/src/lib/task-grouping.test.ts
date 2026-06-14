import { describe, expect, it } from "vitest";
import {
  bucketDashTasks,
  groupTasks,
  type GroupableTask,
} from "./task-grouping";

const t = (
  over: Partial<GroupableTask> & { id: string },
): GroupableTask => ({
  status: "todo",
  priority: null,
  due_date: null,
  ...over,
});

describe("groupTasks", () => {
  it("none mode returns one group with everything", () => {
    const tasks = [t({ id: "a" }), t({ id: "b" })];
    const out = groupTasks(tasks, "none");
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe("all");
    expect(out[0].label).toBe("");
    expect(out[0].tasks).toHaveLength(2);
  });

  it("priority groups: orders High → Medium → Low → No priority and drops empties", () => {
    const tasks = [
      t({ id: "a", priority: 3 }),
      t({ id: "b", priority: 1 }),
      t({ id: "c", priority: null }),
      t({ id: "d", priority: 1 }),
    ];
    const out = groupTasks(tasks, "priority");
    expect(out.map((g) => g.key)).toEqual(["high", "low", "none"]);
    expect(out[0].tasks.map((x) => x.id).sort()).toEqual(["b", "d"]);
  });

  it("status groups: Todo → In progress → Review → Blocked → Done", () => {
    const tasks = [
      t({ id: "a", status: "done" }),
      t({ id: "b", status: "todo" }),
      t({ id: "c", status: "in_progress" }),
    ];
    const out = groupTasks(tasks, "status");
    expect(out.map((g) => g.key)).toEqual([
      "todo",
      "in_progress",
      "done",
    ]);
  });

  it("assignee groups: alphabetical, Unassigned last", () => {
    const tasks = [
      t({
        id: "a",
        assignees: [{ user_id: "u1", full_name: "Zack" }],
      }),
      t({
        id: "b",
        assignees: [{ user_id: "u2", full_name: "Ann" }],
      }),
      t({ id: "c", assignees: [] }),
    ];
    const out = groupTasks(tasks, "assignee");
    expect(out.map((g) => g.label)).toEqual([
      "Ann",
      "Zack",
      "Unassigned",
    ]);
  });

  it("assignee groups: a task with two assignees lands in BOTH buckets", () => {
    const tasks = [
      t({
        id: "shared",
        assignees: [
          { user_id: "u1", full_name: "Ann" },
          { user_id: "u2", full_name: "Bob" },
        ],
      }),
    ];
    const out = groupTasks(tasks, "assignee");
    expect(out).toHaveLength(2);
    expect(out[0].tasks).toHaveLength(1);
    expect(out[1].tasks).toHaveLength(1);
    expect(out[0].tasks[0].id).toBe("shared");
    expect(out[1].tasks[0].id).toBe("shared");
  });

  it("due groups: Overdue → Today → This week → Later → No due date", () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const twoDays = new Date(today);
    twoDays.setDate(twoDays.getDate() + 2);
    const month = new Date(today);
    month.setMonth(month.getMonth() + 1);

    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const tasks = [
      t({ id: "old", due_date: fmt(yesterday) }),
      t({ id: "today", due_date: fmt(today) }),
      t({ id: "soon", due_date: fmt(twoDays) }),
      t({ id: "later", due_date: fmt(month) }),
      t({ id: "none" }),
    ];
    const out = groupTasks(tasks, "due");
    expect(out.map((g) => g.key)).toEqual([
      "overdue",
      "today",
      "week",
      "later",
      "none",
    ]);
    expect(out[0].tasks[0].id).toBe("old");
    expect(out[1].tasks[0].id).toBe("today");
    expect(out[2].tasks[0].id).toBe("soon");
    expect(out[3].tasks[0].id).toBe("later");
    expect(out[4].tasks[0].id).toBe("none");
  });

  it("empty list returns one empty group regardless of mode", () => {
    expect(groupTasks([], "priority")).toEqual([
      { key: "all", label: "", tasks: [] },
    ]);
  });
});

describe("bucketDashTasks", () => {
  const tickerById = { t1: "HELIOS", t2: "CASA" };
  const nameById = { t1: "Helios", t2: "Casablanca" };

  const dt = (
    over: Partial<GroupableTask> & { id: string; terminal_id: string },
  ) => ({
    status: "todo",
    priority: null as number | null,
    due_date: null as string | null,
    ...over,
  });

  it("terminal mode dedupes identical ticker/name, keeps TICKER · Name when they differ", () => {
    const out = bucketDashTasks(
      [
        dt({ id: "a", terminal_id: "t1" }),
        dt({ id: "b", terminal_id: "t2" }),
        dt({ id: "c", terminal_id: "t1" }),
      ],
      "terminal",
      tickerById,
      nameById,
    );
    expect(out).toHaveLength(2);
    const labels = out.map((g) => g.label);
    // t1: ticker "HELIOS" equals name "Helios" (case-insensitive) → shown once.
    expect(labels).toContain("Helios");
    expect(labels).not.toContain("HELIOS · Helios");
    // t2: ticker "CASA" genuinely differs from "Casablanca" → keep both.
    expect(labels).toContain("CASA · Casablanca");
  });

  it("terminal mode falls back to ticker-only when name missing", () => {
    const out = bucketDashTasks(
      [dt({ id: "a", terminal_id: "t1" })],
      "terminal",
      tickerById,
      undefined,
    );
    expect(out[0].label).toBe("HELIOS");
  });

  it("delegates to groupTasks for shared modes", () => {
    const out = bucketDashTasks(
      [
        dt({ id: "a", terminal_id: "t1", priority: 1 }),
        dt({ id: "b", terminal_id: "t2", priority: null }),
      ],
      "priority",
      tickerById,
      nameById,
    );
    expect(out.map((g) => g.key)).toEqual(["high", "none"]);
  });

  it("supports status mode (toolbar parity with the in-terminal pane)", () => {
    const out = bucketDashTasks(
      [
        dt({ id: "a", terminal_id: "t1", status: "done" }),
        dt({ id: "b", terminal_id: "t2", status: "todo" }),
        dt({ id: "c", terminal_id: "t1", status: "in_progress" }),
      ],
      "status",
      tickerById,
      nameById,
    );
    expect(out.map((g) => g.key)).toEqual(["todo", "in_progress", "done"]);
  });

  it("none mode returns flat single group", () => {
    const out = bucketDashTasks(
      [dt({ id: "a", terminal_id: "t1" })],
      "none",
      tickerById,
      nameById,
    );
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("");
  });
});
