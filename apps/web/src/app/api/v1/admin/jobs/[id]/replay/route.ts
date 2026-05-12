import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { replayDeadJob } from "@/lib/jobs";
import { emitEvent } from "@/lib/events";

import { withObservability } from "@/lib/observability";
interface Props {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/admin/jobs/:id/replay
 *
 * Resets a dead-letter job back to pending and runs it immediately on
 * the next worker tick. Resets attempt to 0 so the operator gets the
 * full backoff window.
 */
export const dynamic = "force-dynamic";

async function handlePost(request: NextRequest, { params }: Props) {
  const { id } = await params;
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { userId } = gate;

  let updated = false;
  try {
    updated = await replayDeadJob(id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: msg }] },
      { status: 500 },
    );
  }

  if (!updated) {
    return NextResponse.json(
      {
        errors: [
          {
            code: "conflict",
            message: "Job not in dead state (already running, done, or pending).",
          },
        ],
      },
      { status: 409 },
    );
  }

  void emitEvent("admin.jobs.replayed", {
    actor_id: userId,
    entity_type: "job",
    entity_id: id,
    payload: {},
  });

  return NextResponse.json({ data: { id, replayed: true } });
}

export const POST = withObservability<Props>(
  handlePost,
  "POST /api/v1/admin/jobs/:id/replay",
);
