import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScopedModuleShell } from "@/components/pane/ScopedModuleShell";
import { ScopedTaskList } from "@/components/modules/ScopedTaskList";
import { loadTasksForSpace } from "@/lib/modules/tasks-queries";

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * `/s/[slug]/tasks` — space-scope tasks aggregate.
 *
 * New in Phase 1: lists every open task across the space's terminals.
 * Renders inside the pane shell so the user can hop to Files /
 * Schedule / Messenger tabs without leaving the space context.
 */
export default async function SpaceTasksPage({ params }: Props) {
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

  const tasks = await loadTasksForSpace(supabase, space.id);

  return (
    <ScopedModuleShell
      scopeKind="space"
      scopeKey={slug}
      activeSlug="tasks"
      flagOffBehavior="render"
    >
      <ScopedTaskList
        tasks={tasks}
        title={`Tasks · ${space.name}`}
        emptyMessage="No open tasks in this space yet."
      />
    </ScopedModuleShell>
  );
}
