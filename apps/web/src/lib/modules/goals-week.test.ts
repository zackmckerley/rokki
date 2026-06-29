import { describe, it, expect } from "vitest";
import {
  startOfWeek,
  endOfWeek,
  formatWeekLabel,
  startOfMonth,
  endOfMonth,
  periodWindow,
  DEFAULT_WEEK_START_DOW,
} from "./goals-week";

describe("goals-week — month boundaries", () => {
  it("startOfMonth is the 1st", () => {
    expect(startOfMonth("2026-06-29")).toBe("2026-06-01");
    expect(startOfMonth("2026-01-15")).toBe("2026-01-01");
  });
  it("endOfMonth is the last day, handling lengths + leap years", () => {
    expect(endOfMonth("2026-06-10")).toBe("2026-06-30");
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28");
    expect(endOfMonth("2024-02-10")).toBe("2024-02-29");
    expect(endOfMonth("2026-12-01")).toBe("2026-12-31");
  });
});

describe("goals-week — periodWindow", () => {
  it("daily window is the single day", () => {
    expect(periodWindow("daily", "2026-06-25")).toEqual({
      start: "2026-06-25",
      end: "2026-06-25",
    });
  });
  it("weekly window is Mon–Sun", () => {
    expect(periodWindow("weekly", "2026-06-25")).toEqual({
      start: "2026-06-22",
      end: "2026-06-28",
    });
  });
  it("monthly window is the whole month", () => {
    expect(periodWindow("monthly", "2026-06-25")).toEqual({
      start: "2026-06-01",
      end: "2026-06-30",
    });
  });
});

describe("goals-week — startOfWeek (Monday default)", () => {
  // Reference dates so we know what to expect.
  const cases: Array<{ in: string; out: string; note: string }> = [
    { in: "2026-05-12", out: "2026-05-11", note: "Tue → previous Mon" },
    { in: "2026-05-11", out: "2026-05-11", note: "Mon → itself" },
    { in: "2026-05-10", out: "2026-05-04", note: "Sun → previous Mon" },
    { in: "2026-05-17", out: "2026-05-11", note: "Sun later → previous Mon" },
    { in: "2026-01-01", out: "2025-12-29", note: "year boundary" },
    { in: "2024-02-29", out: "2024-02-26", note: "leap day" },
  ];
  for (const c of cases) {
    it(`${c.in} → ${c.out} (${c.note})`, () => {
      expect(startOfWeek(c.in)).toBe(c.out);
    });
  }
});

describe("goals-week — endOfWeek (Sunday default)", () => {
  it("Mon → following Sun", () => {
    expect(endOfWeek("2026-05-11")).toBe("2026-05-17");
  });
  it("Sun → itself", () => {
    expect(endOfWeek("2026-05-17")).toBe("2026-05-17");
  });
  it("crosses month boundary", () => {
    expect(endOfWeek("2026-04-30")).toBe("2026-05-03");
  });
});

describe("goals-week — week start day override", () => {
  it("Sun-start (dow=0): Sun → itself, Sat → next Sun is end", () => {
    expect(startOfWeek("2026-05-10", 0)).toBe("2026-05-10");
    expect(endOfWeek("2026-05-10", 0)).toBe("2026-05-16");
  });
  it("Sat-start (dow=6): Sat → itself", () => {
    expect(startOfWeek("2026-05-16", 6)).toBe("2026-05-16");
  });
});

describe("goals-week — formatWeekLabel", () => {
  it("renders short day + month + day", () => {
    const label = formatWeekLabel("2026-05-11", "2026-05-17");
    expect(label).toMatch(/Mon/);
    expect(label).toMatch(/Sun/);
    expect(label).toMatch(/→/);
  });
});

describe("goals-week — property: 200 random dates land on the same week", () => {
  // Pick 200 random dates and verify their startOfWeek answers
  // are all the same Monday (week-start invariant).
  it("invariants hold across 200 random dates", () => {
    function rng(seed: number): () => number {
      let s = seed;
      return () => {
        s = (s * 1664525 + 1013904223) % 2 ** 32;
        return s / 2 ** 32;
      };
    }
    const rand = rng(42);

    for (let i = 0; i < 200; i++) {
      // Random date in 2024–2026.
      const year = 2024 + Math.floor(rand() * 3);
      const month = 1 + Math.floor(rand() * 12);
      const day = 1 + Math.floor(rand() * 28);
      const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const start = startOfWeek(iso, DEFAULT_WEEK_START_DOW);
      const end = endOfWeek(iso, DEFAULT_WEEK_START_DOW);

      // Invariant 1: start ≤ iso ≤ end
      expect(start <= iso).toBe(true);
      expect(iso <= end).toBe(true);
      // Invariant 2: end is exactly 6 days after start
      const [sy, sm, sd] = start.split("-").map(Number);
      const [ey, em, ed] = end.split("-").map(Number);
      const startD = new Date(Date.UTC(sy, sm - 1, sd));
      const endD = new Date(Date.UTC(ey, em - 1, ed));
      const diff = (endD.getTime() - startD.getTime()) / 86_400_000;
      expect(diff).toBe(6);
      // Invariant 3: start lands on Monday (UTC getDay === 1)
      expect(startD.getUTCDay()).toBe(1);
    }
  });
});
