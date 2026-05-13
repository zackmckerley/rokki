import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ScopedModuleShell } from "@/components/pane/ScopedModuleShell";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { loadThreadsForSpace } from "@/lib/modules/messenger-queries";

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * `/s/[slug]/messages` — Messenger module at space scope.
 *
 * Lists every thread attached to the space (space-wide channel +
 * any group threads scoped here). Phase 1 is a read-only list; the
 * full messenger inbox at `/messages` is one click away if the user
 * wants to compose.
 */
export default async function SpaceMessagesPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: spaceRow } = await supabase
    .from("spaces")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();
  const space = spaceRow as { id: string; name: string } | null;
  if (!space) redirect("/");

  const threads = await loadThreadsForSpace(supabase, space.id);

  return (
    <ScopedModuleShell
      scopeKind="space"
      scopeKey={slug}
      activeSlug="messenger"
      flagOffBehavior="render"
    >
      <div className="p-2 sm:p-3">
        <DashboardCard
          title={`Messenger · ${space.name}`}
          count={threads.length}
          expandHref="/messages"
        >
          {threads.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-text-3">
              No threads attached to this space yet.
            </p>
          ) : (
            <ul className="divide-y divide-border/40">
              {threads.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/messages?thread=${t.id}`}
                    className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-bg-2"
                  >
                    <MessageSquare
                      className="h-3 w-3 flex-shrink-0 text-text-3"
                      aria-hidden="true"
                    />
                    <span className="flex-1 truncate text-text-0">
                      {labelForThread(t.kind)}
                    </span>
                    {t.last_message_at ? (
                      <span className="font-mono text-[10px] text-text-3">
                        {new Date(t.last_message_at).toLocaleDateString()}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DashboardCard>
      </div>
    </ScopedModuleShell>
  );
}

function labelForThread(kind: string): string {
  if (kind === "space") return "Space-wide channel";
  if (kind === "group") return "Group thread";
  if (kind === "dm") return "Direct message";
  return kind;
}
