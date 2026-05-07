import { describe, expect, it } from "vitest";
import { applyTaskSort } from "./tasks-sort";

interface T {
  id: string;
  status: string;
  /** 1=High, 2=Medium, 3=Low, null=No priority. */
  priority: number | null;
  due_date: string | null;
  position: number | null;
  created_at: string;
  updated_at: string;
  assignees: { user_id: string; full_name: string | null }[];
}

const t = (over: Partial<T> & { id: string }): T => ({
  status: "todo",
  priority: null,
  due_date: null,
  position: null,
  created_at: "2026-04-20T00:00:00Z",
  updated_at: "2026-04-20T00:00:00Z",
  assignees: [],
  ...over,
});

describe("applyTaskSort", () => {
  it("default sort: priority then due, oldest-due wins", () => {
    const tasks: T[] = [
      t({ id: "a", priority: 3, due_date: "2026-04-30" }),
      t({ id: "b", priority: 1, due_date: "2026-05-15" }),
      t({ id: "c", priority: 1, due_date: "2026-04-25" }),
    ];
    const sorted = applyTaskSort(tasks, "default").map((x) => x.id);
    expect(sorted).toEqual(["c", "b", "a"]);
  });

  it("priority sort: high (1) first, no-priority (null) last", () => {
    const tasks: T[] = [
      t({ id: "lo", priority: 3 }),
      t({ id: "none", priority: null }),
      t({ id: "hi", priority: 1 }),
      t({ id: "med", priority: 2 }),
    ];
    expect(applyTaskSort(tasks, "priority").map((x) => x.id)).toEqual([
      "hi",
      "med",
      "lo",
      "none",
    ]);
  });

  it("due-date sort: nulls last, soonest first", () => {
    const tasks: T[] = [
      t({ id: "later", due_date: "2026-12-01" }),
      t({ id: "no-due", due_date: null }),
      t({ id: "soon", due_date: "2026-04-30" }),
    ];
    expect(applyTaskSort(tasks, "due").map((x) => x.id)).toEqual([
      "soon",
      "later",
      "no-due",
    ]);
  });

  it("assignee sort: alphabetical, unassigned last", () => {
    const tasks: T[] = [
      t({
        id: "z",
        assignees: [{ user_id: "u1", full_name: "Zara Q" }],
      }),
      t({ id: "none", assignees: [] }),
      t({
        id: "a",
        assignees: [{ user_id: "u2", full_name: "Alice K" }],
      }),
    ];
    expect(applyTaskSort(tasks, "assignee").map((x) => x.id)).toEqual([
      "a",
      "z",
      "none",
    ]);
  });

  it("status sort: todo → done", () => {
    const tasks: T[] = [
      t({ id: "done", status: "done" }),
      t({ id: "todo", status: "todo" }),
      t({ id: "blk", status: "blocked" }),
      t({ id: "ip", status: "in_progress" }),
    ];
    expect(applyTaskSort(tasks, "status").map((x) => x.id)).toEqual([
      "todo",
      "ip",
      "blk",
      "done",
    ]);
  });

  it("created sort: newest first", () => {
    const tasks: T[] = [
      t({ id: "old", created_at: "2026-01-01T00:00:00Z" }),
      t({ id: "new", created_at: "2026-04-26T00:00:00Z" }),
      t({ id: "mid", created_at: "2026-03-15T00:00:00Z" }),
    ];
    expect(applyTaskSort(tasks, "created").map((x) => x.id)).toEqual([
      "new",
      "mid",
      "old",
    ]);
  });

  it("manual sort: by sparse position; nulls last", () => {
    const tasks: T[] = [
      t({ id: "no-pos", position: null }),
      t({ id: "high", position: 3000 }),
      t({ id: "low", position: 1000 }),
      t({ id: "mid", position: 2000 }),
    ];
    expect(applyTaskSort(tasks, "manual").map((x) => x.id)).toEqual([
      "low",
      "mid",
      "high",
      "no-pos",
    ]);
  });

  it("is stable: equal keys preserve original order", () => {
    const tasks: T[] = [
      t({ id: "a", priority: 2, created_at: "2026-04-10T00:00:00Z" }),
      t({ id: "b", priority: 2, created_at: "2026-04-10T00:00:00Z" }),
      t({ id: "c", priority: 2, created_at: "2026-04-10T00:00:00Z" }),
    ];
    expect(applyTaskSort(tasks, "priority").map((x) => x.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});
