import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import type { TaskStatus } from "@rokki/db";

/**
 * POST /api/v1/tasks/bulk  { task_ids, action, ...payload }
 *
 * Bulk operations from the multi-select bar in the task list view. RLS is
 * still the gatekeeper — we just iterate inside one request rather than
 * forcing the client to make N round-trips.
 *
 * Supported actions:
 *   - status        { status: TaskStatus }                 — set status (and completed_at if done)
 *   - priority      { priority: 1..3 | null }              — set priority (null = no priority)
 *   - delete        — remove the rows
 *   - assign        { user_ids: string[], replace: bool }  — add (or replace) assignees
 *
 * The response is { data: { applied: string[], failed: { id, reason }[] } }.
 * Failures don't abort the whole batch; partial success is the expected mode.
 */
type BulkBody =
  | {
      task_ids: string[];
      action: "status";
      status: TaskStatus;
    }
  | {
      task_ids: string[];
      action: "priority";
      priority: number | null;
    }
  | {
      task_ids: string[];
      action: "delete";
    }
  | {
      task_ids: string[];
      action: "assign";
      user_ids: string[];
      replace?: boolean;
    };

async function handlePost(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const body = (await request.json().catch(() => null)) as BulkBody | null;
  if (!body || !Array.isArray(body.task_ids) || body.task_ids.length === 0) {
    return bad("task_ids must be a non-empty array");
  }
  if (body.task_ids.length > 500) {
    return bad("task_ids capped at 500 per call");
  }
  // De-dupe to avoid running the same id twice in this batch.
  const ids = Array.from(new Set(body.task_ids));

  const applied: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  switch (body.action) {
    case "status": {
      if (!body.status) return bad("status is required");
      const completed_at =
        body.status === "done" ? new Date().toISOString() : null;
      const { data, error } = await supabase
        .from("tasks")
        // @ts-expect-error generic update collapses to never
        .update({ status: body.status, completed_at })
        .in("id", ids)
        .select("id");
      if (error) return internal(error.message);
      const okIds = new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
      for (const id of ids) {
        if (okIds.has(id)) applied.push(id);
        else failed.push({ id, reason: "permission denied or not found" });
      }
      break;
    }
    case "priority": {
      // null is allowed (= "no priority"). 1..3 otherwise.
      if (
        body.priority !== null &&
        (typeof body.priority !== "number" ||
          body.priority < 1 ||
          body.priority > 3)
      )
        return bad(
          "priority must be 1 (High), 2 (Medium), 3 (Low), or null",
        );
      const { data, error } = await supabase
        .from("tasks")
        // @ts-expect-error generic update collapses to never
        .update({ priority: body.priority })
        .in("id", ids)
        .select("id");
      if (error) return internal(error.message);
      const okIds = new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
      for (const id of ids) {
        if (okIds.has(id)) applied.push(id);
        else failed.push({ id, reason: "permission denied or not found" });
      }
      break;
    }
    case "delete": {
      const { data, error } = await supabase
        .from("tasks")
        .delete()
        .in("id", ids)
        .select("id");
      if (error) return internal(error.message);
      const okIds = new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
      for (const id of ids) {
        if (okIds.has(id)) applied.push(id);
        else failed.push({ id, reason: "permission denied or not found" });
      }
      break;
    }
    case "assign": {
      if (!Array.isArray(body.user_ids) || body.user_ids.length === 0)
        return bad("user_ids is required for action=assign");
      const userIds = Array.from(new Set(body.user_ids));

      // Optional replace mode: clear existing assignees first.
      if (body.replace) {
        await supabase
          .from("task_assignees")
          .delete()
          .in("task_id", ids);
      }

      // Build the cross-product (task_id × user_id). RLS on
      // task_assignees_insert prevents inserts for tasks the caller can't
      // touch — those rows simply fail and we count them as "failed".
      const rows = ids.flatMap((tid) =>
        userIds.map((uid) => ({
          task_id: tid,
          user_id: uid,
          assigned_by: user.id,
        })),
      );
      const result = await supabase
        .from("task_assignees")
        // @ts-expect-error generic upsert collapses to never
        .upsert(rows, { onConflict: "task_id,user_id" })
        .select("task_id");
      if (result.error) return internal(result.error.message);
      const okTaskIds = new Set(
        ((result.data ?? []) as { task_id: string }[]).map((r) => r.task_id),
      );
      for (const id of ids) {
        if (okTaskIds.has(id)) applied.push(id);
        else failed.push({ id, reason: "permission denied or not found" });
      }
      break;
    }
    default: {
      return bad(`unknown action: ${(body as { action?: string }).action}`);
    }
  }

  return NextResponse.json({ data: { applied, failed } });
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
function internal(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "internal_error", message: msg }] },
    { status: 500 },
  );
}

export const POST = withObservability(handlePost, "POST /api/v1/tasks/bulk");
