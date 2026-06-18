// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";

// Realtime is a live Supabase subscription — stub it to a no-op so the card
// renders deterministically in jsdom.
vi.mock("@/lib/supabase/realtime", () => ({
  useRealtimeTable: () => {},
}));

import { MessagesCard } from "./MessagesCard";

const THREADS = [
  {
    id: "t-rokki",
    kind: "dm",
    source: "rokki",
    label: "Carlos",
    last_message_at: "2026-06-17T12:00:00Z",
  },
  {
    id: "t-signal",
    kind: "signal",
    source: "signal",
    label: "Mom",
    last_message_at: "2026-06-17T13:00:00Z",
    signal_id: "+13055551212",
    signal_kind: "direct",
  },
];

interface FetchCall {
  url: string;
  method: string;
  body: unknown;
}
let calls: FetchCall[];

function jsonRes(data: unknown, ok = true) {
  return Promise.resolve({
    ok,
    json: async () => data,
  } as Response);
}

function installFetch() {
  calls = [];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, method, body });

    if (url === "/api/v1/messages/threads" && method === "GET")
      return jsonRes({ data: THREADS });
    if (url === "/api/v1/me") return jsonRes({ data: { user_id: "me" } });
    if (url === "/api/v1/messages/threads/t-rokki" && method === "GET")
      return jsonRes({
        data: [
          {
            id: "m1",
            author_id: "carlos",
            body: "hey there",
            created_at: "2026-06-17T12:00:00Z",
            author_name: "Carlos",
          },
          {
            id: "m2",
            author_id: "me",
            body: "yo",
            created_at: "2026-06-17T12:01:00Z",
            author_name: "Me",
          },
        ],
      });
    if (url === "/api/v1/signal/threads/t-signal" && method === "GET")
      return jsonRes({
        data: {
          messages: [
            {
              id: "s1",
              direction: "in",
              sender: "Mom",
              body: "call me",
              sent_at: "2026-06-17T13:00:00Z",
              attachments: [],
            },
          ],
        },
      });
    if (url === "/api/v1/messages/threads/t-rokki" && method === "POST")
      return jsonRes({ data: { id: "m3", created_at: "now" } }, true);
    if (url === "/api/v1/signal/send" && method === "POST")
      return jsonRes({ data: { ok: true } }, true);
    return jsonRes({ data: [] });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  installFetch();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MessagesCard", () => {
  it("lists recent conversations", async () => {
    render(<MessagesCard />);
    expect(await screen.findByText("Carlos")).toBeTruthy();
    expect(screen.getByText("Mom")).toBeTruthy();
  });

  it("opens a native thread and posts a quick reply to /api/v1/messages", async () => {
    render(<MessagesCard />);
    fireEvent.click(await screen.findByText("Carlos"));

    // Recent messages load into the quick view.
    expect(await screen.findByText("hey there")).toBeTruthy();

    const input = screen.getByPlaceholderText(/Reply/i);
    fireEvent.change(input, { target: { value: "on my way" } });
    fireEvent.click(screen.getByLabelText("Send reply"));

    await waitFor(() => {
      const post = calls.find(
        (c) => c.url === "/api/v1/messages/threads/t-rokki" && c.method === "POST",
      );
      expect(post).toBeTruthy();
      expect((post!.body as { body: string }).body).toBe("on my way");
    });
  });

  it("opens a Signal thread and sends through the bridge with the signal target", async () => {
    render(<MessagesCard />);
    fireEvent.click(await screen.findByText("Mom"));

    expect(await screen.findByText("call me")).toBeTruthy();

    const input = screen.getByPlaceholderText(/Reply on Signal/i);
    fireEvent.change(input, { target: { value: "calling now" } });
    fireEvent.click(screen.getByLabelText("Send reply"));

    await waitFor(() => {
      const post = calls.find(
        (c) => c.url === "/api/v1/signal/send" && c.method === "POST",
      );
      expect(post).toBeTruthy();
      const b = post!.body as { signalId: string; kind: string; text: string };
      expect(b.signalId).toBe("+13055551212");
      expect(b.kind).toBe("direct");
      expect(b.text).toBe("calling now");
    });
  });

  it("returns to the conversation list via back", async () => {
    render(<MessagesCard />);
    fireEvent.click(await screen.findByText("Carlos"));
    expect(await screen.findByText("hey there")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Back to conversations"));
    // Both threads visible again; the composer is gone.
    expect(await screen.findByText("Mom")).toBeTruthy();
    expect(screen.queryByPlaceholderText(/Reply/i)).toBeNull();
  });
});
