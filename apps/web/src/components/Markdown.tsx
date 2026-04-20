"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Shared markdown renderer. One place to style GFM output so every
 * description, comment, or AI-generated note reads the same.
 *
 * - GitHub-flavored markdown (tables, strikethrough, checklists, autolinks)
 * - No raw HTML passed through (XSS-safe by default)
 * - Terminal-dense type ramp: compact paragraphs, monospaced inline code,
 *   muted secondary text
 */
export function Markdown({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // Type ramp
        "text-sm leading-relaxed text-text-0",
        // Headings
        "[&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-base [&_h1]:font-semibold",
        "[&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-sm [&_h2]:font-semibold",
        "[&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-text-1",
        // Paragraphs
        "[&_p]:mb-2 [&_p:last-child]:mb-0",
        // Lists
        "[&_ul]:mb-2 [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-0.5",
        "[&_ol]:mb-2 [&_ol]:ml-5 [&_ol]:list-decimal [&_ol]:space-y-0.5",
        "[&_li]:text-text-1",
        // Checkboxes (GFM task lists)
        "[&_input[type='checkbox']]:mr-1 [&_input[type='checkbox']]:align-middle",
        // Links
        "[&_a]:text-accent [&_a]:underline-offset-2 [&_a:hover]:underline",
        // Inline code + block code
        "[&_code]:rounded-sm [&_code]:bg-bg-2 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-text-0",
        "[&_pre]:mb-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:border [&_pre]:border-border [&_pre]:bg-bg-1 [&_pre]:p-2",
        "[&_pre_code]:border-0 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
        // Blockquote
        "[&_blockquote]:mb-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-text-2",
        // Tables
        "[&_table]:mb-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs",
        "[&_th]:border [&_th]:border-border [&_th]:bg-bg-2 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold",
        "[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1",
        // Horizontal rule
        "[&_hr]:my-4 [&_hr]:border-border",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </div>
  );
}
