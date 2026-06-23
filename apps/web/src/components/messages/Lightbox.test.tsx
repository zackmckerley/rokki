// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Lightbox } from "./Lightbox";
import type { ChatAttachment } from "./ChatThread";

afterEach(cleanup);

const items: ChatAttachment[] = [
  { url: "https://x/a.jpg", content_type: "image/jpeg", filename: "a.jpg", size: 1 },
  { url: "https://x/b.jpg", content_type: "image/jpeg", filename: "b.jpg", size: 1 },
];

describe("Lightbox", () => {
  it("renders the current image", () => {
    render(<Lightbox items={items} index={0} onClose={vi.fn()} onNav={vi.fn()} />);
    const img = screen.getByAltText("a.jpg") as HTMLImageElement;
    expect(img.src).toContain("a.jpg");
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<Lightbox items={items} index={0} onClose={onClose} onNav={vi.fn()} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("navigates with the next button (wrapping)", () => {
    const onNav = vi.fn();
    render(<Lightbox items={items} index={1} onClose={vi.fn()} onNav={onNav} />);
    fireEvent.click(screen.getByLabelText("Next"));
    expect(onNav).toHaveBeenCalledWith(0); // wraps from last to first
  });

  it("renders nothing when the item has no url", () => {
    const { container } = render(
      <Lightbox
        items={[{ url: null, content_type: "image/jpeg", filename: "x", size: 1 }]}
        index={0}
        onClose={vi.fn()}
        onNav={vi.fn()}
      />,
    );
    expect(container.querySelector("img")).toBeNull();
  });
});
