import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { emitEvent } from "@/lib/events";

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * POST /api/v1/admin/tools/:slug/moderation
 *   { status: "approved" | "pending" | "disabled" | "featured" }
 *
 * Single endpoint that swaps the tool's moderation flag. Disabled tools
 * are surfaced as 403 from the invoke endpoint (added in a follow-up
 * patch); featured tools get promoted in /tools.
 */
const STATUSES = ["approved", "pending", "disabled", "featured"] as const;

export async function POST(request: NextRequest, { params }: Props) {
  const { slug } = await params;
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;

  const body = (await request.json().catch(() => ({}))) as {
    status?: (typeof STATUSES)[number];
  };
  if (!body.status || !STATUSES.includes(body.status))
    return NextResponse.json(
      {
        errors: [
          {
            code: "invalid_request",
            message: `status must be one of ${STATUSES.join(", ")}`,
          },
        ],
      },
      { status: 400 },
    );

  const { data, error } = await admin
    .from("tools")
    .update({ moderation_status: body.status } as never)
    .eq("slug", slug)
    .select("id, slug, moderation_status")
    .single();
  if (error || !data)
    return NextResponse.json(
      {
        errors: [
          {
            code: error ? "internal_error" : "not_found",
            message: error?.message ?? "Tool not found",
          },
        ],
      },
      { status: error ? 500 : 404 },
    );

  void emitEvent("admin.tool.moderated", {
    actor_id: actorId,
    entity_type: "tool",
    entity_id: (data as { id: string }).id,
    payload: { slug, moderation_status: body.status },
  });

  return NextResponse.json({ data });
}
