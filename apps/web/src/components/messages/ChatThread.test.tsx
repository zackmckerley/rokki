// @vitest-environment jsdom
import { type ReactElement } from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import {
  ChatMessageList,
  isEmojiOnly,
  formatBytes,
  formatRelative,
  linkify,
  type ChatMessage,
} from "./ChatThread";

afterEach(cleanup);

function msg(over: Partial<ChatMessage> & { id: string }): ChatMessage {
  return {
    mine: false,
    body: "",
    at: "2026-06-17T12:00:00Z",
    attachments: [],
    ...over,
  };
}

describe("isEmojiOnly", () => {
  it("is true for pure-emoji messages (up to 6)", () => {
    expect(isEmojiOnly("😀")).toBe(true);
    expect(isEmojiOnly("😀🎉🔥")).toBe(true);
    expect(isEmojiOnly("  😀  ")).toBe(true);
  });
  it("is false for text, mixed, empty, or too many", () => {
    expect(isEmojiOnly("nope")).toBe(false);
    expect(isEmojiOnly("😀 hi")).toBe(false);
    expect(isEmojiOnly("")).toBe(false);
    expect(isEmojiOnly("😀😀😀😀😀😀😀")).toBe(false); // 7 > cap
  });
  it("handles flags, ZWJ sequences and keycaps as single graphemes", () => {
    expect(isEmojiOnly("🇺🇸")).toBe(true); // one flag
    expect(isEmojiOnly("👨‍👩‍👧‍👦")).toBe(true); // family ZWJ → one grapheme
    expect(isEmojiOnly("👨‍👩‍👧‍👦👨‍👩‍👧‍👦")).toBe(true); // two graphemes
    expect(isEmojiOnly("1️⃣")).toBe(true); // keycap
    expect(isEmojiOnly("🇺🇸🇺🇸🇺🇸🇺🇸🇺🇸🇺🇸🇺🇸")).toBe(false); // 7 flags > cap
  });
});

describe("formatBytes", () => {
  it("renders B / KB / MB", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(1_572_864)).toBe("1.5 MB");
  });
});

describe("formatRelative", () => {
  it("renders compact relative times", () => {
    expect(formatRelative(new Date(Date.now() - 30_000).toISOString())).toBe(
      "now",
    );
    expect(formatRelative(new Date(Date.now() - 5 * 60_000).toISOString())).toBe(
      "5m",
    );
    expect(
      formatRelative(new Date(Date.now() - 3 * 3600_000).toISOString()),
    ).toBe("3h");
  });
});

describe("ChatMessageList", () => {
  it("shows the empty state", () => {
    render(<ChatMessageList messages={[]} emptyText="Nothing here." />);
    expect(screen.getByText("Nothing here.")).toBeTruthy();
  });

  it("renders message bodies", () => {
    render(
      <ChatMessageList
        messages={[
          msg({ id: "a", body: "hello" }),
          msg({ id: "b", mine: true, body: "hi back" }),
        ]}
      />,
    );
    expect(screen.getByText("hello")).toBeTruthy();
    expect(screen.getByText("hi back")).toBeTruthy();
  });

  it("renders an emoji-only message jumbo (no bubble)", () => {
    render(<ChatMessageList messages={[msg({ id: "e", body: "😀" })]} />);
    const el = screen.getByText("😀");
    expect(el.className).toContain("text-5xl");
  });

  it("groups a run and shows one timestamp/status for the last bubble only", () => {
    render(
      <ChatMessageList
        messages={[
          msg({
            id: "g1",
            mine: true,
            body: "one",
            at: "2026-06-17T12:00:00Z",
            status: "read",
          }),
          msg({
            id: "g2",
            mine: true,
            body: "two",
            at: "2026-06-17T12:01:00Z",
            status: "read",
          }),
        ]}
      />,
    );
    // Both are "mine" within a minute → one run → exactly one status tick.
    expect(screen.getAllByLabelText("read")).toHaveLength(1);
  });

  it("renders an image attachment and tags GIFs", () => {
    render(
      <ChatMessageList
        messages={[
          msg({
            id: "img",
            attachments: [
              {
                url: "https://x/test.gif",
                content_type: "image/gif",
                filename: "test.gif",
                size: 1000,
              },
            ],
          }),
        ]}
      />,
    );
    const img = screen.getByAltText("test.gif") as HTMLImageElement;
    expect(img.src).toContain("test.gif");
    expect(screen.getByText("GIF")).toBeTruthy();
  });

  it("renders a non-image file as a card with name + size", () => {
    render(
      <ChatMessageList
        messages={[
          msg({
            id: "f",
            attachments: [
              {
                url: "https://x/deck.pdf",
                content_type: "application/pdf",
                filename: "deck.pdf",
                size: 2048,
              },
            ],
          }),
        ]}
      />,
    );
    expect(screen.getByText("deck.pdf")).toBeTruthy();
    expect(screen.getByText("2 KB")).toBeTruthy();
  });

  it("opens the delete menu and calls the right handler", () => {
    const onMe = vi.fn();
    const onAll = vi.fn();
    render(
      <ChatMessageList
        messages={[msg({ id: "d", mine: true, body: "secret" })]}
        onDeleteForMe={onMe}
        onDeleteForEveryone={onAll}
      />,
    );
    fireEvent.click(screen.getByLabelText("Message options"));
    expect(screen.getByText("Delete for me")).toBeTruthy();
    fireEvent.click(screen.getByText("Delete for everyone"));
    expect(onAll).toHaveBeenCalledWith("d");
    expect(onMe).not.toHaveBeenCalled();
  });

  it("does not offer 'delete for everyone' on incoming messages", () => {
    render(
      <ChatMessageList
        messages={[msg({ id: "in", mine: false, body: "theirs" })]}
        onDeleteForMe={vi.fn()}
        onDeleteForEveryone={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("Message options"));
    expect(screen.getByText("Delete for me")).toBeTruthy();
    expect(screen.queryByText("Delete for everyone")).toBeNull();
  });

  it("calls onOpenImage instead of navigating when provided", () => {
    const onOpenImage = vi.fn();
    render(
      <ChatMessageList
        onOpenImage={onOpenImage}
        messages={[
          msg({
            id: "lb",
            attachments: [
              {
                url: "https://x/p.jpg",
                content_type: "image/jpeg",
                filename: "p.jpg",
                size: 10,
              },
            ],
          }),
        ]}
      />,
    );
    fireEvent.click(screen.getByAltText("p.jpg"));
    expect(onOpenImage).toHaveBeenCalledWith("https://x/p.jpg");
  });

  it("shows the sender name above incoming group chats", () => {
    render(
      <ChatMessageList
        showSender
        messages={[msg({ id: "s", mine: false, sender: "Alice", body: "hi" })]}
      />,
    );
    expect(screen.getByText("Alice")).toBeTruthy();
  });

  it("turns URLs in message text into safe links", () => {
    render(
      <ChatMessageList
        messages={[
          msg({ id: "u", body: "see https://rokki.ai/docs for more" }),
        ]}
      />,
    );
    const link = screen.getByRole("link", {
      name: "https://rokki.ai/docs",
    }) as HTMLAnchorElement;
    expect(link.href).toBe("https://rokki.ai/docs");
    expect(link.target).toBe("_blank");
    expect(link.rel).toContain("noopener");
    // Surrounding text is preserved.
    expect(screen.getByText(/for more/)).toBeTruthy();
  });

  it("does not create links for plain text", () => {
    render(<ChatMessageList messages={[msg({ id: "p", body: "just text" })]} />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("linkify", () => {
  it("does not swallow trailing punctuation", () => {
    const nodes = linkify("go to https://x.com.", false);
    const link = nodes.find(
      (n): n is ReactElement<{ href: string }> =>
        typeof n === "object" && n !== null && "props" in n,
    );
    expect(link?.props.href).toBe("https://x.com");
  });
});
