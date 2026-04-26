// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useUndoStack } from "./use-undo-stack";

describe("useUndoStack", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with the seed value, no undo, no redo", () => {
    const { result } = renderHook(() => useUndoStack("hello"));
    expect(result.current.value).toBe("hello");
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("updates value immediately but defers committing the snapshot", () => {
    const { result } = renderHook(() =>
      useUndoStack("a", { debounceMs: 200 }),
    );
    act(() => {
      result.current.setValue("ab");
    });
    expect(result.current.value).toBe("ab");
    // Mid-flight typing is not yet committed → there's nothing to undo TO yet.
    expect(result.current.canUndo).toBe(false);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.canUndo).toBe(true);
  });

  it("collapses rapid edits into a single undoable snapshot", () => {
    const { result } = renderHook(() =>
      useUndoStack("a", { debounceMs: 200 }),
    );
    act(() => {
      result.current.setValue("ab");
    });
    act(() => {
      vi.advanceTimersByTime(50);
      result.current.setValue("abc");
      vi.advanceTimersByTime(50);
      result.current.setValue("abcd");
      vi.advanceTimersByTime(200); // now flush
    });
    expect(result.current.canUndo).toBe(true);
    act(() => {
      result.current.undo();
    });
    // Only one undo step exists between "a" and "abcd" — the intermediate
    // edits collapsed.
    expect(result.current.value).toBe("a");
    expect(result.current.canUndo).toBe(false);
  });

  it("undo() flushes the pending debounce so the in-flight edit is undoable", () => {
    const { result } = renderHook(() =>
      useUndoStack("hello", { debounceMs: 200 }),
    );
    act(() => {
      result.current.setValue("hello world");
    });
    // No timer flush — go straight to undo.
    act(() => {
      result.current.undo();
    });
    expect(result.current.value).toBe("hello");
  });

  it("redo() restores the most recently undone value", () => {
    const { result } = renderHook(() => useUndoStack(""));
    act(() => {
      result.current.setValue("one", { commit: true });
      result.current.setValue("two", { commit: true });
    });
    act(() => {
      result.current.undo();
    });
    expect(result.current.value).toBe("one");
    expect(result.current.canRedo).toBe(true);
    act(() => {
      result.current.redo();
    });
    expect(result.current.value).toBe("two");
    expect(result.current.canRedo).toBe(false);
  });

  it("a new edit clears the redo stack", () => {
    const { result } = renderHook(() => useUndoStack(""));
    act(() => {
      result.current.setValue("a", { commit: true });
      result.current.setValue("ab", { commit: true });
      result.current.undo(); // back to "a", redo stack has "ab"
    });
    expect(result.current.canRedo).toBe(true);
    act(() => {
      result.current.setValue("ax", { commit: true });
    });
    expect(result.current.canRedo).toBe(false);
  });

  it("caps the past stack at `limit` entries", () => {
    const { result } = renderHook(() =>
      useUndoStack("0", { limit: 3, debounceMs: 0 }),
    );
    for (const v of ["1", "2", "3", "4", "5"]) {
      act(() => result.current.setValue(v));
    }
    // Past should hold the last 3 committed pre-current snapshots: 2,3,4.
    // Current value is "5". Undoing 3 times should land us on "2", and then
    // canUndo flips false because we hit the cap.
    act(() => {
      result.current.undo();
    });
    expect(result.current.value).toBe("4");
    act(() => {
      result.current.undo();
    });
    expect(result.current.value).toBe("3");
    act(() => {
      result.current.undo();
    });
    expect(result.current.value).toBe("2");
    expect(result.current.canUndo).toBe(false);
  });

  it("ignores duplicate snapshots", () => {
    const { result } = renderHook(() => useUndoStack("x"));
    act(() => {
      result.current.setValue("x", { commit: true });
      result.current.setValue("x", { commit: true });
    });
    expect(result.current.canUndo).toBe(false);
  });

  it("reset() wipes both stacks and reseeds", () => {
    const { result } = renderHook(() => useUndoStack(""));
    act(() => {
      result.current.setValue("a", { commit: true });
      result.current.setValue("ab", { commit: true });
      result.current.undo();
    });
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(true);
    act(() => {
      result.current.reset("fresh");
    });
    expect(result.current.value).toBe("fresh");
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("onKeyDown handles ⌘Z and ⌘⇧Z, calling preventDefault on success", () => {
    const { result } = renderHook(() => useUndoStack(""));
    act(() => {
      result.current.setValue("hello", { commit: true });
    });
    const undoEvent = mockKeyEvent("z", { metaKey: true });
    act(() => {
      result.current.onKeyDown(undoEvent);
    });
    expect(result.current.value).toBe("");
    expect(undoEvent.preventDefault).toHaveBeenCalledTimes(1);

    const redoEvent = mockKeyEvent("z", { metaKey: true, shiftKey: true });
    act(() => {
      result.current.onKeyDown(redoEvent);
    });
    expect(result.current.value).toBe("hello");
    expect(redoEvent.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("onKeyDown lets unrelated keys fall through", () => {
    const { result } = renderHook(() => useUndoStack(""));
    const e = mockKeyEvent("a", {});
    act(() => {
      result.current.onKeyDown(e);
    });
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it("onKeyDown does NOT preventDefault when there's nothing to undo", () => {
    const { result } = renderHook(() => useUndoStack(""));
    const e = mockKeyEvent("z", { metaKey: true });
    act(() => {
      result.current.onKeyDown(e);
    });
    // Empty stack → let the browser's native undo run.
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it("onKeyDown treats Ctrl+Z the same as ⌘Z (Windows/Linux parity)", () => {
    const { result } = renderHook(() => useUndoStack(""));
    act(() => {
      result.current.setValue("done", { commit: true });
    });
    const e = mockKeyEvent("z", { ctrlKey: true });
    act(() => {
      result.current.onKeyDown(e);
    });
    expect(result.current.value).toBe("");
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("invokes onUndo with from/to/agoSeconds", () => {
    const onUndo = vi.fn();
    const { result } = renderHook(() => useUndoStack("", { onUndo }));
    act(() => {
      result.current.setValue("first", { commit: true });
      vi.advanceTimersByTime(3500);
      result.current.setValue("second", { commit: true });
    });
    act(() => {
      result.current.undo();
    });
    expect(onUndo).toHaveBeenCalledTimes(1);
    const call = onUndo.mock.calls[0]![0] as {
      from: string;
      to: string;
      agoSeconds: number;
    };
    expect(call.from).toBe("second");
    expect(call.to).toBe("first");
    expect(call.agoSeconds).toBeGreaterThanOrEqual(3);
  });
});

function mockKeyEvent(
  key: string,
  flags: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean },
): React.KeyboardEvent<HTMLTextAreaElement> {
  return {
    key,
    metaKey: !!flags.metaKey,
    ctrlKey: !!flags.ctrlKey,
    shiftKey: !!flags.shiftKey,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as React.KeyboardEvent<HTMLTextAreaElement>;
}
