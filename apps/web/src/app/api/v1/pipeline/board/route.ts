import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { ok, unauthorized, badRequest, forbidden } from "@/lib/pipeline/api";
import { ensurePipelineForSpace, listLeads } from "@/lib/pipeline/queries";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/pipeline/board?space_id=… — the space's pipeline + its leads.
 * Creates the default (HELIOS) pipeline on first use. The board groups the
 * leads into stage columns client-side.
 */
async function handleGet(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const spaceId = request.nextUrl.searchParams.get("space_id");
  if (!spaceId) return badRequest("space_id is required");

  // Confirm membership for a clean 403 (RLS also enforces on read/write).
  const { data: membership } = await supabase
    .from("space_members")
    .select("space_id")
    .eq("space_id", spaceId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return forbidden("Not a member of this space");

  try {
    const pipeline = await ensurePipelineForSpace(supabase, spaceId, user.id);
    const leads = await listLeads(supabase, pipeline.id);
    return ok({ pipeline, leads });
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "Failed to load board");
  }
}

export const GET = withObservability(handleGet, "GET /api/v1/pipeline/board");
