import { describe, it, expect } from "vitest";
import { parseCommand, tokenize } from "./command-parser";

describe("tokenize", () => {
  it("splits on whitespace", () => {
    expect(tokenize("GO HOME")).toEqual(["GO", "HOME"]);
  });
  it("preserves quoted runs", () => {
    expect(tokenize('BRKL TASK "buy windows"')).toEqual([
      "BRKL",
      "TASK",
      "buy windows",
    ]);
  });
  it("handles multiple quoted runs", () => {
    expect(tokenize('X "a b" Y "c d"')).toEqual(["X", "a b", "Y", "c d"]);
  });
});

describe("parseCommand", () => {
  it("GO HOME -> /", () => {
    expect(parseCommand("GO HOME")).toMatchObject({
      kind: "navigate",
      path: "/",
    });
  });
  it("GO TOOLS -> /tools (case-insensitive)", () => {
    expect(parseCommand("go tools")).toMatchObject({
      kind: "navigate",
      path: "/tools",
    });
  });
  it("unknown GO destination errors", () => {
    expect(parseCommand("GO BANANA")).toMatchObject({ kind: "error" });
  });

  it("<TICKER> alone goes to terminal", () => {
    expect(parseCommand("BRKL")).toMatchObject({
      kind: "navigate",
      ticker: "BRKL",
      path: "/p/BRKL",
    });
  });
  it("<TICKER> GO goes to terminal", () => {
    expect(parseCommand("BRKL GO")).toMatchObject({
      kind: "navigate",
      path: "/p/BRKL",
    });
  });
  it("<TICKER> F3 adds pane query", () => {
    expect(parseCommand("BRKL F3")).toMatchObject({
      kind: "navigate",
      path: "/p/BRKL?pane=F3",
    });
  });
  it("<TICKER> TASK with quotes", () => {
    expect(parseCommand('BRKL TASK "buy windows"')).toMatchObject({
      kind: "create_task",
      ticker: "BRKL",
      task_title: "buy windows",
    });
  });
  it("<TICKER> ASK with quotes", () => {
    expect(parseCommand('BRKL ASK "what is overdue?"')).toMatchObject({
      kind: "ask_ai",
      ticker: "BRKL",
      ai_prompt: "what is overdue?",
    });
  });
  it("<TICKER> TASK without args errors", () => {
    expect(parseCommand("BRKL TASK")).toMatchObject({ kind: "error" });
  });

  it("TOOL <slug> navigates", () => {
    expect(parseCommand("TOOL aerial-reels")).toMatchObject({
      kind: "navigate",
      path: "/tools/aerial-reels",
    });
  });
  it("TOOL without slug errors", () => {
    expect(parseCommand("TOOL")).toMatchObject({ kind: "error" });
  });

  it("leading slash opens palette", () => {
    expect(parseCommand("/overdue")).toMatchObject({
      kind: "open_palette",
      palette_query: "overdue",
    });
  });
  it("empty input -> noop", () => {
    expect(parseCommand("   ")).toMatchObject({ kind: "noop" });
  });
  it("gibberish (not a ticker, not a known verb) errors gracefully", () => {
    // A single token that isn't in the GO/TOOL set and doesn't match the
    // uppercase ticker pattern after normalization (digit-first fails the
    // TICKER regex).
    expect(parseCommand("42foo")).toMatchObject({ kind: "error" });
  });

  it("short ASCII word is treated as a ticker go-to", () => {
    // Any 2-10 letter token becomes a ticker — intentional, matches the
    // Bloomberg "type a symbol and press enter" UX.
    expect(parseCommand("brkl")).toMatchObject({
      kind: "navigate",
      ticker: "BRKL",
    });
  });
});
