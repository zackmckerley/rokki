import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { emitEvent } from "@/lib/events";

import { withObservability } from "@/lib/observability";
/**
 * GET /api/v1/admin/tools
 *   ?moderation= "approved" | "pending" | "disabled" | "featured" | (all)
 *
 * The list returns marketplace-wide; the per-slug actions live in
 * /api/v1/admin/tools/[slug]/{approve,disable,feature}.
 */
async function handleGet(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin } = gate;

  const url = new URL(request.url);
  const mod = url.searchParams.get("moderation");

  let query = admin
    .from("tools")
    .select(
      "id, slug, name, description, visibility, moderation_status, owner_user_id, owner_space_id, current_version, tags, created_at, updated_at",
    )
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(500);
  if (mod) {
    query = query.eq(
      "moderation_status",
      mod as "approved" | "pending" | "disabled" | "featured",
    );
  }
  const { data, error } = await query;
  if (error)
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: error.message }] },
      { status: 500 },
    );
  return NextResponse.json({ data: data ?? [] });
}

export const GET = withObservability(
  handleGet,
  "GET /api/v1/admin/tools",
);
