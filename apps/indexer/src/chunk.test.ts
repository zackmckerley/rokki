import { describe, it, expect } from "vitest";
import { buildChunks, chunkText, estimateTokens } from "./chunk";

describe("chunker", () => {
  it("returns the text itself when under the target size", () => {
    const text = "Hello world";
    expect(chunkText(text)).toEqual(["Hello world"]);
  });

  it("splits oversized text on paragraph boundaries", () => {
    const para = "word ".repeat(400).trim(); // ~2000 chars = 500 tokens
    const body = Array.from({ length: 4 }, () => para).join("\n\n");
    const chunks = chunkText(body);
    expect(chunks.length).toBeGreaterThan(1);
    // Each chunk should keep paragraph integrity — no split mid-paragraph
    // unless a single paragraph is bigger than the target. With 4 paras of
    // ~2000 chars each we expect roughly 4 chunks.
    expect(chunks.length).toBeLessThanOrEqual(5);
    expect(chunks.join(" ").includes("word word")).toBe(true);
  });

  it("builds chunks with page numbers for PDF pages", () => {
    const result = buildChunks({
      kind: "pages",
      pages: ["page one", "page two has more words"],
    });
    expect(result).toHaveLength(2);
    expect(result[0].pageNumber).toBe(1);
    expect(result[1].pageNumber).toBe(2);
  });

  it("builds chunks from a plain text block with null page numbers", () => {
    const result = buildChunks({ kind: "text", text: "just text" });
    expect(result).toHaveLength(1);
    expect(result[0].pageNumber).toBeNull();
    expect(result[0].content).toBe("just text");
  });

  it("estimates tokens approximately", () => {
    expect(estimateTokens("four")).toBe(1);
    expect(estimateTokens("x".repeat(400))).toBe(100);
  });

  it("falls back to char-chunker for oversized single paragraphs", () => {
    const longWord = "x".repeat(3000);
    const chunks = chunkText(longWord);
    expect(chunks.length).toBeGreaterThan(1);
  });
});
