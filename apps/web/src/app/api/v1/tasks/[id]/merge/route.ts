import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/tasks/:id/merge { target_id, move_subtasks?, combine_descriptions? }
 *
 * Merges :id (the source) into :target_id. Performed inside a single
 * request — there's no DB transaction across multiple supabase-js calls,
 * so we order writes so a partial failure leaves the source intact and
 * the target fully usable. The source becomes the "loser" and is
 * soft-deleted (status='done', a metadata flag, completed_at=now()).
 *
 * Operations (in order):
 *   1. validate both tasks live in the same terminal (RLS would block
 *      cross-terminal moves anyway, but a clean error message is nicer)
 *   2. optionally re-parent subtasks to the target
 *   3. always re-target comments (entity_id) to the target
 *   4. always re-target task_files (composite PK requires a delete + insert)
 *   5. optionally combine descriptions (target's body || sep || source's body)
 *   6. soft-delete the source (status=done, metadata.merged_into=target_id)
 *
 * NOT moved (intentionally):
 *   - assignees: the target may already have its own. Asking the user
 *     would push this past "two checkboxes" and we'd rather they pick
 *     manually after.
 *   - dependencies: dependency graphs need careful conflict resolution.
 *   - watchers: same as assignees.
 */
async function handlePost(request: NextRequest, { params }: Props) {
  const { id: sourceId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const body = (await request.json().catch(() => ({}))) as {
    target_id?: string;
    move_subtasks?: boolean;
    combine_descriptions?: boolean;
  };
  if (!body.target_id) return bad("target_id is required");
  if (body.target_id === sourceId)
    return bad("target_id must differ from source id");

  const moveSubtasks = body.move_subtasks ?? true;
  const combineDescriptions = body.combine_descriptions ?? true;

  // 1. Validate same terminal.
  const { data: pair, error: pairErr } = await supabase
    .from("tasks")
    .select("id, terminal_id, title, description")
    .in("id", [sourceId, body.target_id]);
  if (pairErr) return internal(pairErr.message);
  type T = {
    id: string;
    terminal_id: string;
    title: string;
    description: string | null;
  };
  const tasks = (pair ?? []) as T[];
  const source = tasks.find((t) => t.id === sourceId);
  const target = tasks.find((t) => t.id === body.target_id);
  if (!source || !target) return notFound();
  if (source.terminal_id !== target.terminal_id)
    return bad("tasks must live in the same terminal to merge");

  // 2. Subtasks: just rewrite the FK. Position collisions don't matter
  //    because position is sparse — a few duplicates sort by id as a
  //    tiebreaker and the user can reorder after.
  if (moveSubtasks) {
    const { error } = await supabase
      .from("subtasks")
      // @ts-expect-error generic update collapses to never
      .update({ task_id: body.target_id })
      .eq("task_id", sourceId);
    if (error) return internal(`subtasks: ${error.message}`);
  }

  // 3. Comments: rewrite entity_id (entity_type stays 'task').
  {
    const { error } = await supabase
      .from("comments")
      // @ts-expect-error generic update collapses to never
      .update({ entity_id: body.target_id })
      .eq("entity_type", "task")
      .eq("entity_id", sourceId);
    if (error) return internal(`comments: ${error.message}`);
  }

  // 4. task_files: composite PK means we can't UPDATE one of the columns
  //    in-place without conflicting with rows already on the target. Read,
  //    upsert into target (ignore conflicts), then delete from source.
  {
    const { data: links } = await supabase
      .from("task_files")
      .select("file_id")
      .eq("task_id", sourceId);
    type L = { file_id: string };
    const fileIds = ((links ?? []) as L[]).map((l) => l.file_id);
    if (fileIds.length > 0) {
      const inserts = fileIds.map((file_id) => ({
        task_id: body.target_id!,
        file_id,
        attached_by: user.id,
      }));
      // upsert: ignore-on-conflict so a file already attached to the
      // target survives the merge.
      const { error: upErr } = await supabase
        .from("task_files")
        // @ts-expect-error generic insert collapses to never
        .upsert(inserts, { onConflict: "task_id,file_id", ignoreDuplicates: true });
      if (upErr) return internal(`task_files upsert: ${upErr.message}`);
      const { error: delErr } = await supabase
        .from("task_files")
        .delete()
        .eq("task_id", sourceId);
      if (delErr) return internal(`task_files delete: ${delErr.message}`);
    }
  }

  // 5. Combine descriptions (only when the source has one and the user
  //    asked for it). Use a markdown HR + a "merged from …" header so the
  //    history of the merge is visible inside the target body.
  if (combineDescriptions && source.description?.trim()) {
    const sep = `\n\n---\n_Merged from "${source.title}"_\n\n`;
    const next =
      (target.description?.trim()
        ? target.description.trim()
        : "") + sep + source.description.trim();
    const { error } = await supabase
      .from("tasks")
      // @ts-expect-error generic update collapses to never
      .update({ description: next })
      .eq("id", body.target_id);
    if (error) return internal(`target description: ${error.message}`);
  }

  // 6. Soft-delete the source. We mark it done + metadata flag so the
  //    series of (done, completed_at, status) and the realtime feed
  //    behave normally, but downstream UI can hide it via the metadata.
  {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("tasks")
      // @ts-expect-error generic update collapses to never
      .update({
        status: "done",
        completed_at: now,
        metadata: { merged_into: body.target_id, merged_at: now },
      })
      .eq("id", sourceId);
    if (error) return internal(`source soft-delete: ${error.message}`);
  }

  // Activity log on the target.
  await supabase
    .from("activity")
    // @ts-expect-error Phase 0 — Database<generic> inference collapses to never
    .insert({
      terminal_id: target.terminal_id,
      actor_id: user.id,
      action: "task.update",
      entity_type: "task",
      entity_id: body.target_id,
      metadata: {
        merged_from_id: sourceId,
        merged_from_title: source.title,
        moved_subtasks: moveSubtasks,
        combined_descriptions: combineDescriptions && Boolean(source.description?.trim()),
      },
    });

  return NextResponse.json({
    data: {
      target_id: body.target_id,
      source_id: sourceId,
      moved_subtasks: moveSubtasks,
      combined_descriptions:
        combineDescriptions && Boolean(source.description?.trim()),
    },
  });
}

function unauth() {
  return NextResponse.json(
    { errors: [{ code: "unauthenticated", message: "Sign in required" }] },
    { status: 401 },
  );
}
function bad(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "invalid_request", message: msg }] },
    { status: 400 },
  );
}
function notFound() {
  return NextResponse.json(
    { errors: [{ code: "not_found", message: "Task not found" }] },
    { status: 404 },
  );
}
function internal(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "internal_error", message: msg }] },
    { status: 500 },
  );
}

export const POST = withObservability<Props>(handlePost, "POST /api/v1/tasks/:id/merge");
