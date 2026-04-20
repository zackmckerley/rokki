/**
 * Text extraction — bytes in, plain text out (plus optional per-page splits).
 *
 * Supported today:
 *   - text/* and common code MIME types → verbatim UTF-8 decode
 *   - application/pdf → unpdf extracts per-page text
 *
 * Returned as either one block of text (text files) or an array of pages
 * (PDFs). Chunker handles further splitting.
 */

const TEXT_MIMES = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/x-yaml",
  "application/yaml",
  "application/x-httpd-php",
  "application/x-sh",
]);

const TEXT_EXTS = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "csv",
  "tsv",
  "yaml",
  "yml",
  "xml",
  "html",
  "css",
  "js",
  "ts",
  "tsx",
  "jsx",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "sh",
  "bash",
  "env",
  "log",
  "ini",
  "conf",
  "toml",
]);

export type ExtractResult =
  | { kind: "text"; text: string }
  | { kind: "pages"; pages: string[] }
  | { kind: "unsupported"; reason: string };

export function isTextLike(mime: string, filename: string): boolean {
  if (mime?.startsWith("text/")) return true;
  if (TEXT_MIMES.has(mime)) return true;
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  return TEXT_EXTS.has(ext);
}

export async function extractText(
  bytes: Uint8Array,
  mime: string,
  filename: string,
): Promise<ExtractResult> {
  const isPdf =
    mime === "application/pdf" || filename.toLowerCase().endsWith(".pdf");

  if (isPdf) {
    try {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const { text } = await extractText(pdf, { mergePages: false });
      // `text` is string[] when mergePages is false.
      const pages = Array.isArray(text)
        ? text.map((t) => (t ?? "").trim()).filter((t) => t.length > 0)
        : [(text as string).trim()];
      if (pages.length === 0)
        return { kind: "unsupported", reason: "pdf had no extractable text" };
      return { kind: "pages", pages };
    } catch (e) {
      return {
        kind: "unsupported",
        reason: `pdf parse failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  if (isTextLike(mime, filename)) {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes).trim();
    if (!text) return { kind: "unsupported", reason: "empty text file" };
    return { kind: "text", text };
  }

  return {
    kind: "unsupported",
    reason: `mime "${mime}" / ext "${filename.split(".").pop()}" not indexable`,
  };
}
