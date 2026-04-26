import { describe, expect, it } from "vitest";
import {
  highlight,
  searchHelp,
  type HelpIndexFile,
} from "./help-search";

const fakeIndex: HelpIndexFile = {
  generated_at: "2026-04-26T00:00:00Z",
  sections: [
    {
      doc: "01_DATA_MODEL",
      doc_title: "Data Model",
      anchor: "tasks",
      heading: "Tasks table",
      level: 2,
      snippet: "Tasks live in the tasks table with priority 1..4 and a status enum.",
      searchable: "tasks table tasks live in the tasks table with priority 1..4 and a status enum.",
    },
    {
      doc: "08_UI_DESIGN",
      doc_title: "UI Design",
      anchor: "shortcuts",
      heading: "Keyboard shortcuts",
      level: 2,
      snippet: "Every primary action has a shortcut. ⌘K opens the palette.",
      searchable: "keyboard shortcuts every primary action has a shortcut. ⌘k opens the palette.",
    },
    {
      doc: "04_AUTH_SECURITY",
      doc_title: "Auth & Security",
      anchor: "rls",
      heading: "Row-Level Security",
      level: 2,
      snippet: "RLS policies on every table; role checks happen in the database.",
      searchable: "row-level security rls policies on every table; role checks happen in the database.",
    },
  ],
};

describe("searchHelp", () => {
  it("returns nothing for empty queries", () => {
    expect(searchHelp(fakeIndex, "")).toEqual([]);
    expect(searchHelp(fakeIndex, "  ")).toEqual([]);
    expect(searchHelp(null, "tasks")).toEqual([]);
  });

  it("ignores tokens shorter than 2 chars", () => {
    expect(searchHelp(fakeIndex, "a")).toEqual([]);
  });

  it("ranks heading hits above body hits", () => {
    const r = searchHelp(fakeIndex, "tasks");
    expect(r[0].section.anchor).toBe("tasks");
  });

  it("multi-token queries reward all-hit specificity", () => {
    const r = searchHelp(fakeIndex, "row level security");
    expect(r[0].section.anchor).toBe("rls");
    expect(r[0].score).toBeGreaterThan(0);
  });

  it("returns at most `limit` results", () => {
    const r = searchHelp(fakeIndex, "the", 1);
    expect(r.length).toBeLessThanOrEqual(1);
  });
});

describe("highlight", () => {
  it("returns the original text when no tokens match", () => {
    expect(highlight("hello world", "xyz")).toEqual([
      { text: "hello world", hit: false },
    ]);
  });

  it("splits on a single hit", () => {
    expect(highlight("hello world", "world")).toEqual([
      { text: "hello ", hit: false },
      { text: "world", hit: true },
    ]);
  });

  it("merges overlapping ranges", () => {
    const out = highlight("tasks tasks", "tasks task");
    // Two non-overlapping "tasks" hits — but "task" matches inside both
    // "tasks" — merge logic should yield two hit chunks total.
    const hitChunks = out.filter((c) => c.hit);
    expect(hitChunks).toHaveLength(2);
    expect(hitChunks[0].text).toBe("tasks");
    expect(hitChunks[1].text).toBe("tasks");
  });

  it("ignores tokens shorter than 2 chars", () => {
    expect(highlight("a a a", "a")).toEqual([{ text: "a a a", hit: false }]);
  });
});
