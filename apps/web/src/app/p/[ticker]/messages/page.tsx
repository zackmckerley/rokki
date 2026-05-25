import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { resolveTerminalBySegment } from "@/lib/resolve-terminal";
import { ScopedModuleShell } from "@/components/pane/ScopedModuleShell";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { loadThreadForTerminal } from "@/lib/modules/messenger-queries";

interface Props {
  params: Promise<{ ticker: string }>;
}

/**
 * `/p/[ticker]/messages` — Messenger module at terminal scope.
 *
 * Every terminal has at most one `kind='terminal'` thread; we surface
 * it here as the entry point. The full messenger composer at
 * `/messages?thread=<id>` is one click away.
 */
export default async function TerminalMessagesPage({ params }: Props) {
  const { ticker } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const terminal = await resolveTerminalBySegment(supabase, ticker);
  if (!terminal) redirect("/");

  const thread = await loadThreadForTerminal(supabase, terminal.id);

  return (
    <ScopedModuleShell
      scopeKind="terminal"
      scopeKey={ticker}
      activeSlug="messenger"
      flagOffBehavior="render"
    >
      <div className="p-2 sm:p-3">
        <DashboardCard
          title={`Messenger · ${terminal.name}`}
          count={thread ? 1 : 0}
          expandHref={thread ? `/messages?thread=${thread.id}` : "/messages"}
        >
          {thread ? (
            <Link
              href={`/messages?thread=${thread.id}`}
              className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-bg-2"
            >
              <MessageSquare
                className="h-3 w-3 flex-shrink-0 text-text-3"
                aria-hidden="true"
              />
              <span className="flex-1 text-text-0">
                Open {terminal.name} thread
              </span>
              {thread.last_message_at ? (
                <span className="font-mono text-[10px] text-text-3">
                  last message{" "}
                  {new Date(thread.last_message_at).toLocaleDateString()}
                </span>
              ) : null}
            </Link>
          ) : (
            <p className="px-3 py-6 text-center text-xs text-text-3">
              No thread for this terminal yet — start one in the full
              Messenger view.
            </p>
          )}
        </DashboardCard>
      </div>
    </ScopedModuleShell>
  );
}
