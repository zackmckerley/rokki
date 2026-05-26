import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveTerminalBySegment } from "@/lib/resolve-terminal";
import { ScopedModuleShell } from "@/components/pane/ScopedModuleShell";
import { ScopedFileList } from "@/components/modules/ScopedFileList";
import { loadFilesForTerminal } from "@/lib/modules/files-queries";

interface Props {
  params: Promise<{ ticker: string }>;
}

/**
 * `/p/[ticker]/files` — terminal-scope files list (read-only MVP).
 * The existing `/p/[ticker]` page already lists files inline; this
 * route exists as the canonical Files-module entry point that the
 * pane shell can deep-link.
 */
export default async function TerminalFilesPage({ params }: Props) {
  const { ticker } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const terminal = await resolveTerminalBySegment(supabase, ticker);
  if (!terminal) redirect("/");

  const files = await loadFilesForTerminal(supabase, terminal.id);

  return (
    <ScopedModuleShell
      scopeKind="terminal"
      scopeKey={ticker}
      activeSlug="files"
      flagOffBehavior="render"
    >
      <ScopedFileList files={files} title={`Files · ${terminal.name}`} />
    </ScopedModuleShell>
  );
}
