// Pin a UTC-negative zone (Miami/Eastern) so the tests exercise the exact
// off-by-one the calendar cluster fixed. Must be set before any Date is built.
process.env.TZ = "America/New_York";

import { describe, it, expect } from "vitest";
import {
  localDateKey,
  localizeItemDate,
  weekStartLocal,
} from "./calendar-local-date";

describe("localDateKey", () => {
  it("formats a locally-constructed date from its local parts", () => {
    // Local midnight July 2 — same in any zone via the local constructor.
    expect(localDateKey(new Date(2026, 6, 2))).toBe("2026-07-02");
  });

  it("keys an 8pm-Eastern instant (stored next-day UTC) to the local day", () => {
    // 8pm July 2 in Miami is 00:00 July 3 UTC. The UTC slice would say July 3;
    // the local key must say July 2.
    const iso = "2026-07-03T00:00:00Z";
    expect(iso.slice(0, 10)).toBe("2026-07-03"); // the old (buggy) key
    expect(localDateKey(new Date(iso))).toBe("2026-07-02"); // the fixed key
  });
});

describe("localizeItemDate", () => {
  it("re-keys a timed event to its local day", () => {
    const ev = {
      kind: "event",
      all_day: false,
      when: "2026-07-03T00:00:00Z", // 8pm July 2 Eastern
      date: "2026-07-03", // server (UTC) bucket
    };
    expect(localizeItemDate(ev).date).toBe("2026-07-02");
  });

  it("leaves all-day events untouched (literal date, never re-parsed)", () => {
    const allDay = {
      kind: "event",
      all_day: true,
      when: "2026-07-02T00:00:00Z",
      date: "2026-07-02",
    };
    // Re-parsing this through new Date() in Eastern would shift it to July 1 —
    // the guard must prevent that.
    expect(localizeItemDate(allDay).date).toBe("2026-07-02");
  });

  it("leaves due-tasks untouched", () => {
    const due = {
      kind: "due",
      all_day: true,
      when: "2026-07-02T12:00:00",
      date: "2026-07-02",
    };
    expect(localizeItemDate(due).date).toBe("2026-07-02");
  });
});

describe("weekStartLocal", () => {
  it("snaps a mid-week date back to its Sunday", () => {
    // 2026-07-02 is a Thursday; its week starts Sunday 2026-06-28.
    expect(weekStartLocal("2026-07-02")).toBe("2026-06-28");
  });

  it("returns a Sunday unchanged", () => {
    expect(weekStartLocal("2026-06-28")).toBe("2026-06-28");
  });
});
