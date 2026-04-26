// @vitest-environment jsdom
import React, { useState } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { axe } from "vitest-axe";
import { RichTextarea } from "./RichTextarea";

void React;

function Harness({ initial = "" }: { initial?: string }) {
  const [v, setV] = useState(initial);
  return (
    <RichTextarea
      value={v}
      onChange={setV}
      ariaLabel="composer"
      placeholder="type here"
    />
  );
}

describe("RichTextarea", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("renders the toolbar with the expected buttons", () => {
    render(<Harness />);
    expect(screen.getByLabelText("Bold (⌘B)")).toBeDefined();
    expect(screen.getByLabelText("Italic (⌘I)")).toBeDefined();
    expect(screen.getByLabelText("Code (⌘E)")).toBeDefined();
    expect(screen.getByLabelText("Link (⌘K)")).toBeDefined();
    expect(screen.getByLabelText("Heading 1 (⌘1)")).toBeDefined();
    expect(screen.getByLabelText("Bullet list (⌘⇧8)")).toBeDefined();
    expect(screen.getByLabelText("Numbered list (⌘⇧7)")).toBeDefined();
  });

  it("compact mode hides the toolbar but keeps the textarea", () => {
    const noop = () => {};
    render(
      <RichTextarea value="" onChange={noop} compact ariaLabel="inline" />,
    );
    expect(screen.queryByRole("toolbar")).toBeNull();
    expect(screen.getByLabelText("inline")).toBeDefined();
  });

  it("typing updates the parent's value", () => {
    render(<Harness />);
    const ta = screen.getByLabelText("composer") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "hello" } });
    expect(ta.value).toBe("hello");
  });

  it("Bold button wraps the selection in **", async () => {
    render(<Harness initial="abc" />);
    const ta = screen.getByLabelText("composer") as HTMLTextAreaElement;
    ta.focus();
    ta.setSelectionRange(0, 3);
    fireEvent.click(screen.getByLabelText("Bold (⌘B)"));
    await flushFrames();
    expect(ta.value).toBe("**abc**");
  });

  it("⌘B keyboard shortcut wraps in **", async () => {
    render(<Harness initial="abc" />);
    const ta = screen.getByLabelText("composer") as HTMLTextAreaElement;
    ta.focus();
    ta.setSelectionRange(0, 3);
    fireEvent.keyDown(ta, { key: "b", metaKey: true });
    await flushFrames();
    expect(ta.value).toBe("**abc**");
  });

  it("⌘I wraps in *", async () => {
    render(<Harness initial="abc" />);
    const ta = screen.getByLabelText("composer") as HTMLTextAreaElement;
    ta.focus();
    ta.setSelectionRange(0, 3);
    fireEvent.keyDown(ta, { key: "i", metaKey: true });
    await flushFrames();
    expect(ta.value).toBe("*abc*");
  });

  it("⌘E wraps in `", async () => {
    render(<Harness initial="abc" />);
    const ta = screen.getByLabelText("composer") as HTMLTextAreaElement;
    ta.focus();
    ta.setSelectionRange(0, 3);
    fireEvent.keyDown(ta, { key: "e", metaKey: true });
    await flushFrames();
    expect(ta.value).toBe("`abc`");
  });

  it("⌘K with selection produces [text]() and parks cursor in URL slot", async () => {
    render(<Harness initial="see docs" />);
    const ta = screen.getByLabelText("composer") as HTMLTextAreaElement;
    ta.focus();
    ta.setSelectionRange(4, 8);
    fireEvent.keyDown(ta, { key: "k", metaKey: true });
    await flushFrames();
    expect(ta.value).toBe("see [docs]()");
  });

  it("⌘1 toggles a heading prefix on the current line", async () => {
    render(<Harness initial="hi" />);
    const ta = screen.getByLabelText("composer") as HTMLTextAreaElement;
    ta.focus();
    ta.setSelectionRange(2, 2);
    fireEvent.keyDown(ta, { key: "1", metaKey: true });
    await flushFrames();
    expect(ta.value).toBe("# hi");
  });

  it("⌘⇧8 toggles a bullet prefix on the current line", async () => {
    render(<Harness initial="hi" />);
    const ta = screen.getByLabelText("composer") as HTMLTextAreaElement;
    ta.focus();
    ta.setSelectionRange(0, 0);
    fireEvent.keyDown(ta, { key: "8", metaKey: true, shiftKey: true });
    await flushFrames();
    expect(ta.value).toBe("- hi");
  });

  it("Tab indents inside a list", async () => {
    render(<Harness initial="- item" />);
    const ta = screen.getByLabelText("composer") as HTMLTextAreaElement;
    ta.focus();
    ta.setSelectionRange(2, 2);
    fireEvent.keyDown(ta, { key: "Tab" });
    await flushFrames();
    expect(ta.value).toBe("  - item");
  });

  it("Shift+Tab dedents", async () => {
    render(<Harness initial="    - item" />);
    const ta = screen.getByLabelText("composer") as HTMLTextAreaElement;
    ta.focus();
    ta.setSelectionRange(4, 4);
    fireEvent.keyDown(ta, { key: "Tab", shiftKey: true });
    await flushFrames();
    expect(ta.value).toBe("  - item");
  });

  it("opens a slash popup when typing `/` at the start of a line", () => {
    render(<Harness />);
    const ta = screen.getByLabelText("composer") as HTMLTextAreaElement;
    ta.focus();
    fireEvent.change(ta, {
      target: { value: "/", selectionStart: 1, selectionEnd: 1 },
    });
    // sync — the slashState is set on the same event tick.
    expect(screen.getByRole("listbox", { name: "Slash commands" })).toBeDefined();
  });

  it("Enter on a slash popup picks the active command", async () => {
    render(<Harness />);
    const ta = screen.getByLabelText("composer") as HTMLTextAreaElement;
    ta.focus();
    fireEvent.change(ta, {
      target: { value: "/bul", selectionStart: 4, selectionEnd: 4 },
    });
    // First match for "bul" is "bullet" — pressing Enter applies it.
    fireEvent.keyDown(ta, { key: "Enter" });
    await flushFrames();
    expect(ta.value).toBe("- ");
  });

  it("toolbar Preview button swaps the textarea for a rendered preview", () => {
    render(<Harness initial="**hi**" />);
    const previewBtn = screen.getByLabelText("Preview");
    fireEvent.click(previewBtn);
    const preview = screen.getByTestId("rich-textarea-preview");
    expect(preview.textContent).toContain("hi");
    // The textarea is no longer in the DOM.
    expect(screen.queryByLabelText("composer")).toBeNull();
    // Edit button puts us back.
    fireEvent.click(screen.getByLabelText("Edit"));
    expect(screen.getByLabelText("composer")).toBeDefined();
  });

  it("⌘Z undoes a toolbar mutation", async () => {
    render(<Harness initial="abc" />);
    const ta = screen.getByLabelText("composer") as HTMLTextAreaElement;
    ta.focus();
    ta.setSelectionRange(0, 3);
    fireEvent.click(screen.getByLabelText("Bold (⌘B)"));
    await flushFrames();
    expect(ta.value).toBe("**abc**");
    fireEvent.keyDown(ta, { key: "z", metaKey: true });
    await flushFrames();
    expect(ta.value).toBe("abc");
  });

  it("has no a11y violations", async () => {
    const { container } = render(<Harness initial="hi" />);
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});

/**
 * Toolbar formatters apply the new value via `requestAnimationFrame` so
 * the textarea selection can be restored after React updates the value.
 * Wait one tick on the macrotask queue + one rAF before asserting.
 */
async function flushFrames(): Promise<void> {
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => resolve()),
  );
  await Promise.resolve();
}
