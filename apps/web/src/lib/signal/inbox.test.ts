import { describe, it, expect } from "vitest";
import {
  signalThreadToInbox,
  mergeInboxThreads,
  type InboxThread,
  type SignalThreadRow,
} from "./inbox";

const row = (over: Partial<SignalThreadRow> = {}): SignalThreadRow => ({
  id: "t1",
  signal_id: "+15551234567",
  kind: "direct",
  title: null,
  last_message_at: "2026-06-15T10:00:00Z",
  created_at: "2026-06-01T00:00:00Z",
  ...over,
});

describe("signalThreadToInbox", () => {
  it("tags source/kind as signal and carries the send target", () => {
    const t = signalThreadToInbox(row());
    expect(t.source).toBe("signal");
    expect(t.kind).toBe("signal");
    expect(t.signal_id).toBe("+15551234567");
    expect(t.signal_kind).toBe("direct");
  });

  it("prefers the title, falls back to signal_id", () => {
    expect(signalThreadToInbox(row({ title: "Mom" })).label).toBe("Mom");
    expect(signalThreadToInbox(row({ title: "  " })).label).toBe("+15551234567");
    expect(signalThreadToInbox(row({ title: null })).label).toBe("+15551234567");
  });

  it("maps group kind, defaults anything else to direct", () => {
    expect(signalThreadToInbox(row({ kind: "group" })).signal_kind).toBe("group");
    expect(signalThreadToInbox(row({ kind: "weird" })).signal_kind).toBe("direct");
  });

  it("falls back to created_at when there are no messages yet", () => {
    const t = signalThreadToInbox(row({ last_message_at: null }));
    expect(t.last_message_at).toBe("2026-06-01T00:00:00Z");
  });
});

describe("mergeInboxThreads", () => {
  it("interleaves native + signal, newest activity first", () => {
    const native: InboxThread[] = [
      { id: "n1", kind: "dm", source: "rokki", label: "Carlos", last_message_at: "2026-06-15T09:00:00Z" },
      { id: "n2", kind: "terminal", source: "rokki", label: "#HELIOS", last_message_at: "2026-06-15T12:00:00Z" },
    ];
    const signal: InboxThread[] = [
      signalThreadToInbox(row({ id: "s1", last_message_at: "2026-06-15T11:00:00Z" })),
    ];
    const merged = mergeInboxThreads(native, signal);
    expect(merged.map((t) => t.id)).toEqual(["n2", "s1", "n1"]);
  });

  it("returns a new array and does not mutate inputs", () => {
    const native: InboxThread[] = [
      { id: "n1", kind: "dm", source: "rokki", label: "a", last_message_at: "2026-06-15T09:00:00Z" },
    ];
    const signal: InboxThread[] = [];
    const merged = mergeInboxThreads(native, signal);
    expect(merged).not.toBe(native);
    expect(native).toHaveLength(1);
  });
});
