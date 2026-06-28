import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { ok, unauthorized, badRequest, notFound } from "@/lib/pipeline/api";
import { getPipeline, createLead, defaultStageKey } from "@/lib/pipeline/queries";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/pipeline/leads  { pipeline_id, space_id, name, stage?, … }
 * Create a lead. Defaults the stage to the pipeline's first stage. RLS
 * (WITH CHECK on space_id) authorizes the write.
 */
async function handlePost(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return badRequest("Invalid JSON body");
  }
  const pipelineId = body.pipeline_id as string | undefined;
  const spaceId = body.space_id as string | undefined;
  if (!pipelineId || !spaceId) {
    return badRequest("pipeline_id and space_id are required");
  }

  const pipeline = await getPipeline(supabase, pipelineId);
  if (!pipeline) return notFound("Pipeline not found");

  try {
    const lead = await createLead(
      supabase,
      { pipeline_id: pipelineId, space_id: spaceId, defaultStage: defaultStageKey(pipeline) },
      body,
      user.id,
    );
    return ok({ lead }, 201);
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "Could not create lead");
  }
}

export const POST = withObservability(handlePost, "POST /api/v1/pipeline/leads");
