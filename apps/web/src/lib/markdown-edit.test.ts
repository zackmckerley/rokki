import { describe, it, expect } from "vitest";
import {
  wrapSelection,
  insertLink,
  togglePrefix,
  indentLines,
  dedentLines,
  detectSlashCommand,
  matchSlashCommands,
  applySlashCommand,
  SLASH_COMMANDS,
} from "./markdown-edit";

describe("wrapSelection", () => {
  it("wraps a non-empty selection with the marker", () => {
    const result = wrapSelection(
      { value: "hello world", selectionStart: 0, selectionEnd: 5 },
      "**",
    );
    expect(result.value).toBe("**hello** world");
    expect(result.value.slice(result.selectionStart, result.selectionEnd)).toBe(
      "hello",
    );
  });

  it("inserts empty markers and parks the caret between them", () => {
    const result = wrapSelection(
      { value: "x", selectionStart: 1, selectionEnd: 1 },
      "**",
    );
    expect(result.value).toBe("x****");
    expect(result.selectionStart).toBe(3);
    expect(result.selectionEnd).toBe(3);
  });

  it("toggles off when the selection itself is wrapped", () => {
    const result = wrapSelection(
      { value: "**bold** text", selectionStart: 0, selectionEnd: 8 },
      "**",
    );
    expect(result.value).toBe("bold text");
    expect(result.value.slice(result.selectionStart, result.selectionEnd)).toBe(
      "bold",
    );
  });

  it("toggles off when markers sit just outside the selection", () => {
    const result = wrapSelection(
      { value: "**bold** text", selectionStart: 2, selectionEnd: 6 },
      "**",
    );
    expect(result.value).toBe("bold text");
  });

  it("works with single-char marker (italic)", () => {
    const result = wrapSelection(
      { value: "ab", selectionStart: 0, selectionEnd: 2 },
      "*",
    );
    expect(result.value).toBe("*ab*");
  });

  it("handles backwards selection (focus < anchor)", () => {
    const result = wrapSelection(
      { value: "hello", selectionStart: 5, selectionEnd: 0 },
      "**",
    );
    expect(result.value).toBe("**hello**");
  });
});

describe("insertLink", () => {
  it("wraps selection in [text]() and parks caret in the URL slot", () => {
    const result = insertLink({
      value: "see docs",
      selectionStart: 4,
      selectionEnd: 8,
    });
    expect(result.value).toBe("see [docs]()");
    expect(result.selectionStart).toBe(11);
    expect(result.selectionEnd).toBe(11);
  });

  it("inserts a placeholder pair and parks caret at the label slot", () => {
    const result = insertLink({
      value: "",
      selectionStart: 0,
      selectionEnd: 0,
    });
    expect(result.value).toBe("[](url)");
    expect(result.selectionStart).toBe(1);
    expect(result.selectionEnd).toBe(1);
  });
});

describe("togglePrefix", () => {
  it("adds `# ` to a single line", () => {
    const result = togglePrefix(
      { value: "hello", selectionStart: 0, selectionEnd: 0 },
      "# ",
    );
    expect(result.value).toBe("# hello");
  });

  it("removes `# ` when re-applied", () => {
    const result = togglePrefix(
      { value: "# hello", selectionStart: 0, selectionEnd: 0 },
      "# ",
    );
    expect(result.value).toBe("hello");
  });

  it("upgrades H2 to H1 when toggling H1", () => {
    const result = togglePrefix(
      { value: "## hi", selectionStart: 0, selectionEnd: 0 },
      "# ",
    );
    expect(result.value).toBe("# hi");
  });

  it("removes any heading level when toggling the same heading prefix", () => {
    const result = togglePrefix(
      { value: "### x", selectionStart: 0, selectionEnd: 0 },
      "### ",
    );
    expect(result.value).toBe("x");
  });

  it("applies bullet to every line in a multi-line selection", () => {
    const value = "a\nb\nc";
    const result = togglePrefix(
      { value, selectionStart: 0, selectionEnd: value.length },
      "- ",
    );
    expect(result.value).toBe("- a\n- b\n- c");
  });

  it("removes bullet from every line when all already have it", () => {
    const value = "- a\n- b";
    const result = togglePrefix(
      { value, selectionStart: 0, selectionEnd: value.length },
      "- ",
    );
    expect(result.value).toBe("a\nb");
  });

  it("on mixed lines (some have, some don't), brings everyone up to a bullet", () => {
    const value = "- a\nb\n- c";
    const result = togglePrefix(
      { value, selectionStart: 0, selectionEnd: value.length },
      "- ",
    );
    expect(result.value).toBe("- a\n- b\n- c");
  });
});

describe("indent / dedent", () => {
  it("indents the current line by two spaces", () => {
    const result = indentLines({
      value: "- item",
      selectionStart: 4,
      selectionEnd: 4,
    });
    expect(result.value).toBe("  - item");
    expect(result.selectionStart).toBe(6);
  });

  it("dedents the current line by two spaces", () => {
    const result = dedentLines({
      value: "  - item",
      selectionStart: 6,
      selectionEnd: 6,
    });
    expect(result.value).toBe("- item");
    expect(result.selectionStart).toBe(4);
  });

  it("dedent is a no-op on lines that aren't indented", () => {
    const result = dedentLines({
      value: "- item",
      selectionStart: 4,
      selectionEnd: 4,
    });
    expect(result.value).toBe("- item");
  });

  it("indents every line in a multi-line selection", () => {
    const value = "- a\n- b";
    const result = indentLines({
      value,
      selectionStart: 0,
      selectionEnd: value.length,
    });
    expect(result.value).toBe("  - a\n  - b");
  });
});

describe("slash command detection", () => {
  it("returns null when there's no slash on this line", () => {
    expect(detectSlashCommand("hello", 5)).toBeNull();
  });

  it("returns the slug when caret is right after `/heading`", () => {
    const v = "/heading";
    expect(detectSlashCommand(v, v.length)?.slug).toBe("heading");
  });

  it("ignores slashes that aren't at the start of the line", () => {
    expect(detectSlashCommand("foo /bar", 8)).toBeNull();
  });

  it("allows leading whitespace before the slash", () => {
    expect(detectSlashCommand("  /h", 4)?.slug).toBe("h");
  });

  it("returns empty slug when nothing typed after `/`", () => {
    expect(detectSlashCommand("/", 1)?.slug).toBe("");
  });
});

describe("matchSlashCommands", () => {
  it("returns the full list for an empty slug", () => {
    expect(matchSlashCommands("").length).toBe(SLASH_COMMANDS.length);
  });

  it("filters by prefix match on id or label", () => {
    expect(matchSlashCommands("bul").map((c) => c.id)).toEqual(["bullet"]);
    expect(matchSlashCommands("h").length).toBeGreaterThan(0);
  });

  it("is case-insensitive", () => {
    expect(matchSlashCommands("BUL").map((c) => c.id)).toEqual(["bullet"]);
  });
});

describe("applySlashCommand", () => {
  it("strips the /slug then applies the prefix", () => {
    const v = "/bul";
    const command = SLASH_COMMANDS.find((c) => c.id === "bullet")!;
    const result = applySlashCommand(
      { value: v, selectionStart: v.length, selectionEnd: v.length },
      command,
    );
    expect(result.value).toBe("- ");
  });

  it("leaves the rest of the line intact when the slash is mid-edit", () => {
    const v = "/h thing";
    const command = SLASH_COMMANDS.find((c) => c.id === "heading")!;
    // Caret is at position 2 (after "/h"), so applySlashCommand removes "/h"
    // and inserts "# " — the trailing " thing" remains on the line.
    const result = applySlashCommand(
      { value: v, selectionStart: 2, selectionEnd: 2 },
      command,
    );
    expect(result.value).toBe("#  thing");
  });
});
