import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { replayDelivery } from "@/lib/webhooks";
import { emitEvent } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/admin/webhooks/deliveries/:id/replay
 *
 * Resets a dead-lettered delivery so the next worker pass picks it up.
 * Returns 409 if the delivery isn't currently dead-lettered (replaying
 * a successful or in-flight delivery would create a duplicate).
 */
export async function POST(request: NextRequest, { params }: Props) {
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { userId } = gate;
  const { id } = await params;

  const ok = await replayDelivery(id);
  if (!ok) {
    return NextResponse.json(
      {
        errors: [
          {
            code: "not_replayable",
            message:
              "Delivery is not dead-lettered (or does not exist). Only failed-final deliveries can be replayed.",
          },
        ],
      },
      { status: 409 },
    );
  }

  void emitEvent("admin.webhook.delivery.replayed", {
    actor_id: userId,
    entity_type: "webhook_delivery",
    entity_id: id,
    payload: {},
  });

  return NextResponse.json({ data: { id, replayed: true } });
}
