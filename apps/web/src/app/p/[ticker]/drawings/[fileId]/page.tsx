import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { resolveTerminalBySegment } from "@/lib/resolve-terminal";
import { TopBar } from "@/components/TopBar";
import { DrawingViewer } from "@/components/drawings/DrawingViewer";

interface Props {
  params: Promise<{ ticker: string; fileId: string }>;
}

/**
 * Drawing detail page. Shows the PDF inline with page nav, zoom, and
 * pinnable annotations. Non-PDF files redirect to the terminal file list
 * (nothing to render).
 */
export default async function DrawingPage({ params }: Props) {
  const { ticker, fileId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const resolved = await resolveTerminalBySegment(supabase, ticker);
  if (!resolved) notFound();
  const terminal = resolved;

  const { data: file } = await supabase
    .from("files")
    .select("id, filename, mime_type, terminal_id, version, revision_label, supersedes")
    .eq("id", fileId)
    .eq("terminal_id", terminal.id)
    .maybeSingle();
  if (!file) notFound();
  const f = file as {
    id: string;
    filename: string;
    mime_type: string;
    terminal_id: string;
    version: number;
    revision_label: string | null;
    supersedes: string | null;
  };
  if (f.mime_type !== "application/pdf") {
    redirect(`/p/${terminal.slug}`);
  }

  // Walk the `supersedes` chain to collect every prior revision. Newest
  // first. This stays cheap because drawings rarely have >5 revisions.
  const revisions: Array<{
    id: string;
    filename: string;
    version: number;
    revision_label: string | null;
    uploaded_at: string;
  }> = [
    {
      id: f.id,
      filename: f.filename,
      version: f.version,
      revision_label: f.revision_label,
      uploaded_at: "",
    },
  ];
  let cursor: string | null = f.supersedes;
  const seen = new Set<string>([f.id]);
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const { data: prev } = await supabase
      .from("files")
      .select("id, filename, version, revision_label, supersedes, uploaded_at")
      .eq("id", cursor)
      .maybeSingle();
    if (!prev) break;
    const p = prev as {
      id: string;
      filename: string;
      version: number;
      revision_label: string | null;
      supersedes: string | null;
      uploaded_at: string;
    };
    revisions.push({
      id: p.id,
      filename: p.filename,
      version: p.version,
      revision_label: p.revision_label,
      uploaded_at: p.uploaded_at,
    });
    cursor = p.supersedes;
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-bg-0">
      <TopBar>
        <Link href="/" className="text-text-3 hover:text-text-1">
          ← Dashboard
        </Link>
        <span className="text-text-3">·</span>
        <Link
          href={`/p/${terminal.slug}`}
          className="text-text-3 hover:text-text-1"
        >
          {terminal.name}
        </Link>
        <span className="text-text-3">·</span>
        <span className="font-mono text-text-0">{f.filename}</span>
        {f.revision_label ? (
          <span className="ml-2 rounded-sm border border-border bg-bg-2 px-1.5 py-0.5 font-mono text-[10px] uppercase text-text-2">
            Rev {f.revision_label}
          </span>
        ) : null}
        {revisions.length > 1 ? (
          <div className="ml-auto flex items-center gap-1 text-[11px]">
            <span className="text-text-3">Revisions:</span>
            {revisions.map((r) => (
              <Link
                key={r.id}
                href={`/p/${terminal.slug}/drawings/${r.id}`}
                className={`rounded-sm border px-1.5 py-0.5 font-mono ${
                  r.id === f.id
                    ? "border-accent bg-accent-subtle text-text-0"
                    : "border-border bg-bg-2 text-text-2 hover:bg-bg-3"
                }`}
              >
                {r.revision_label ?? `v${r.version}`}
              </Link>
            ))}
          </div>
        ) : null}
      </TopBar>
      <main className="flex-1 p-4 min-h-0">
        <DrawingViewer
          fileId={f.id}
          filename={f.filename}
          currentUserId={user.id}
        />
      </main>
    </div>
  );
}
