/**
 * Chunker — splits extracted text into overlapping pieces suitable for
 * embedding. Targets ~500 tokens per chunk with ~50 tokens of overlap.
 *
 * Approximation: one token ≈ 4 characters of English text. We don't run a
 * real tokenizer here because the OpenAI embedding API accepts strings and
 * counts tokens internally; what matters for retrieval quality is that we
 * don't split mid-sentence and that chunks aren't so big they bury the
 * signal. Paragraph-aware: we prefer to break on blank lines, then on
 * sentence boundaries, then as a last resort on character count.
 */

const CHARS_PER_TOKEN = 4;
const TARGET_CHUNK_TOKENS = 500;
const OVERLAP_TOKENS = 50;
const TARGET_CHARS = TARGET_CHUNK_TOKENS * CHARS_PER_TOKEN;
const OVERLAP_CHARS = OVERLAP_TOKENS * CHARS_PER_TOKEN;

export interface Chunk {
  /** Stable chunk index within the file (0-based, monotonic). */
  index: number;
  /** Chunk content — what we embed and return as context. */
  content: string;
  /** Rough token count. */
  tokens: number;
  /** 1-based PDF page number if this chunk came from a single page. */
  pageNumber: number | null;
}

/**
 * Split a big string into overlapping chunks. Tries paragraph boundaries
 * first. Returns an array preserving order.
 */
export function chunkText(text: string, pageNumber: number | null = null): string[] {
  if (!text.trim()) return [];
  if (text.length <= TARGET_CHARS) return [text.trim()];

  // Split on blank lines (paragraphs). Join paragraphs greedily until we'd
  // exceed TARGET_CHARS, then flush a chunk and start the next one with
  // OVERLAP_CHARS of the tail for continuity.
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) return chunkByChar(text);

  const out: string[] = [];
  let current = "";
  for (const para of paragraphs) {
    // Oversized paragraph: fall through to char-chunker for this one.
    if (para.length > TARGET_CHARS) {
      if (current) {
        out.push(current.trim());
        current = "";
      }
      out.push(...chunkByChar(para));
      continue;
    }
    const joined = current ? current + "\n\n" + para : para;
    if (joined.length > TARGET_CHARS && current) {
      out.push(current.trim());
      // Start next chunk with the tail of the previous one as overlap.
      const tail = current.slice(-OVERLAP_CHARS);
      current = tail + "\n\n" + para;
    } else {
      current = joined;
    }
  }
  if (current.trim()) out.push(current.trim());
  void pageNumber; // page-number plumbing handled by caller
  return out;
}

/** Hard fallback: split on sentences / chars. */
function chunkByChar(text: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(i + TARGET_CHARS, text.length);
    // Try to break on a sentence-ish boundary near `end`.
    let cut = end;
    if (end < text.length) {
      const candidate = text.lastIndexOf(". ", end);
      if (candidate > i + TARGET_CHARS / 2) cut = candidate + 1;
    }
    const slice = text.slice(i, cut).trim();
    if (slice) out.push(slice);
    if (cut >= text.length) break;
    i = Math.max(cut - OVERLAP_CHARS, cut);
  }
  return out;
}

export function estimateTokens(s: string): number {
  return Math.max(1, Math.round(s.length / CHARS_PER_TOKEN));
}

/**
 * Build final Chunk[] from a text block or a list of pages.
 * Keeps page numbers when input came from a PDF.
 */
export function buildChunks(
  input:
    | { kind: "text"; text: string }
    | { kind: "pages"; pages: string[] },
): Chunk[] {
  const out: Chunk[] = [];
  let running = 0;
  if (input.kind === "text") {
    for (const content of chunkText(input.text)) {
      out.push({
        index: running++,
        content,
        tokens: estimateTokens(content),
        pageNumber: null,
      });
    }
    return out;
  }
  for (let p = 0; p < input.pages.length; p++) {
    for (const content of chunkText(input.pages[p])) {
      out.push({
        index: running++,
        content,
        tokens: estimateTokens(content),
        pageNumber: p + 1,
      });
    }
  }
  return out;
}
