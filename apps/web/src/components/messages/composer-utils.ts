"use client";

import {
  useEffect,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";

/**
 * Grow a textarea to fit its content up to a max height, then scroll. Call with
 * the textarea ref and its current value so it re-measures on every change.
 */
export function useAutosize(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  maxPx = 120,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, maxPx)}px`;
  }, [ref, value, maxPx]);
}

const DRAFT_PREFIX = "rokki:draft:";

/**
 * A composer draft persisted per conversation in localStorage, so an unsent
 * message survives switching threads / reloading. Returns [draft, setDraft,
 * clearDraft]. Hydrates on mount and whenever the key (thread id) changes.
 */
export function usePersistedDraft(
  key: string,
): [string, Dispatch<SetStateAction<string>>, () => void] {
  const [draft, setDraft] = useState("");

  // Hydrate when the conversation changes.
  useEffect(() => {
    try {
      setDraft(localStorage.getItem(DRAFT_PREFIX + key) ?? "");
    } catch {
      setDraft("");
    }
  }, [key]);

  // Persist on every change (clears the entry when empty).
  useEffect(() => {
    try {
      if (draft) localStorage.setItem(DRAFT_PREFIX + key, draft);
      else localStorage.removeItem(DRAFT_PREFIX + key);
    } catch {
      /* ignore unavailable storage */
    }
  }, [draft, key]);

  return [draft, setDraft, () => setDraft("")];
}

/** Enter submits, Shift+Enter inserts a newline. Use on a composer textarea. */
export function composerKeyDown(
  e: React.KeyboardEvent<HTMLTextAreaElement>,
  submit: () => void,
) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    submit();
  }
}
