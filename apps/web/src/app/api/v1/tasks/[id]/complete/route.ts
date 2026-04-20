import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/tasks/:id/complete — convenience: set status=done + completed_at=now.
 * Spec: docs/02_API.md §2.7.5
 */
export async function POST(_request: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { errors: [{ code: "unauthenticated", message: "Sign in required" }] },
      { status: 401 },
    );
  }

  const result = await supabase
    .from("tasks")
    // @ts-expect-error Phase 0 — Database<generic> inference collapses to never
    .update({ status: "done", completed_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, terminal_id, status, completed_at")
    .single();

  const data = result.data as { terminal_id: string } | null;
  if (result.error || !data) {
    return NextResponse.json(
      { errors: [{ code: "not_found", message: "Task not found" }] },
      { status: 404 },
    );
  }

  await supabase
    .from("activity")
    // @ts-expect-error Phase 0 — Database<generic> inference collapses to never
    .insert({
      terminal_id: data.terminal_id,
      actor_id: user.id,
      action: "task.complete",
      entity_type: "task",
      entity_id: id,
    });

  return NextResponse.json({ data });
}
