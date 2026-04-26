import { notFound } from "next/navigation";
import Link from "next/link";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { TopBar } from "@/components/TopBar";
import { Markdown } from "@/components/Markdown";

interface Props {
  params: Promise<{ doc: string }>;
}

/**
 * Render a docs/<doc>.md file inside the app. Used by deep links from
 * the help search panel ("/help/01_DATA_MODEL#tasks-table" → this page
 * with auto-scroll to the slug).
 *
 * Read at request time (Node fs) — these files ship with the repo and
 * are tiny. Caching is left to Next's RSC layer.
 *
 * Anti-XSS: we trust the markdown content because it lives in our own
 * repo. The Markdown component already strips raw HTML.
 */
export default async function HelpDocPage({ params }: Props) {
  const { doc } = await params;

  // Allowlist guard: must be a known docs file basename. Prevents
  // path-traversal via `/help/..%2F..%2Fetc/passwd`.
  if (!/^[A-Za-z0-9_-]+$/.test(doc)) notFound();

  // Try a few cwd-relative paths so the same code works in dev (cwd =
  // apps/web) and standalone (cwd = repo root).
  const candidates = [
    join(process.cwd(), "..", "..", "docs", `${doc}.md`),
    join(process.cwd(), "docs", `${doc}.md`),
  ];
  let body: string | null = null;
  for (const path of candidates) {
    try {
      body = await readFile(path, "utf8");
      break;
    } catch {
      // try next candidate
    }
  }
  if (!body) notFound();

  return (
    <div className="flex min-h-screen flex-col bg-bg-0">
      <TopBar>
        <Link href="/help" className="text-text-3 hover:text-text-1">
          ← Help
        </Link>
        <span className="text-text-3">·</span>
        <span className="font-mono text-text-1">{doc}.md</span>
      </TopBar>
      <main className="mx-auto w-full max-w-4xl flex-1 p-6">
        <Markdown source={body} />
      </main>
    </div>
  );
}
