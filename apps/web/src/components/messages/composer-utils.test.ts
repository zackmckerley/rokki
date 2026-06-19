import { describe, it, expect } from "vitest";
import type { KeyboardEvent } from "react";
import { composerKeyDown } from "./composer-utils";

type KE = KeyboardEvent<HTMLTextAreaElement>;

function evt(key: string, shiftKey: boolean) {
  let prevented = false;
  const e = {
    key,
    shiftKey,
    preventDefault: () => {
      prevented = true;
    },
  } as unknown as KE;
  return { e, wasPrevented: () => prevented };
}

describe("composerKeyDown", () => {
  it("Enter without shift submits and prevents the newline", () => {
    let submitted = false;
    const { e, wasPrevented } = evt("Enter", false);
    composerKeyDown(e, () => {
      submitted = true;
    });
    expect(submitted).toBe(true);
    expect(wasPrevented()).toBe(true);
  });

  it("Shift+Enter inserts a newline (no submit)", () => {
    let submitted = false;
    const { e, wasPrevented } = evt("Enter", true);
    composerKeyDown(e, () => {
      submitted = true;
    });
    expect(submitted).toBe(false);
    expect(wasPrevented()).toBe(false);
  });

  it("other keys do nothing", () => {
    let submitted = false;
    const { e } = evt("a", false);
    composerKeyDown(e, () => {
      submitted = true;
    });
    expect(submitted).toBe(false);
  });
});
