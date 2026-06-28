import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { ok, unauthorized, badRequest, notFound } from "@/lib/pipeline/api";
import { getPipeline, updatePipeline } from "@/lib/pipeline/queries";

interface Props {
  params: Promise<{ id: string }>;
}

/** GET /api/v1/pipeline/pipelines/:id */
async function handleGet(_request: NextRequest, { params }: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const pipeline = await getPipeline(supabase, id);
  if (!pipeline) return notFound("Pipeline not found");
  return ok({ pipeline });
}

/** PATCH /api/v1/pipeline/pipelines/:id — edit name / stages / fields. */
async function handlePatch(request: NextRequest, { params }: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return badRequest("Invalid JSON body");
  }
  try {
    const pipeline = await updatePipeline(supabase, id, body);
    if (!pipeline) return notFound("Pipeline not found");
    return ok({ pipeline });
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "Could not update pipeline");
  }
}

export const GET = withObservability<Props>(handleGet, "GET /api/v1/pipeline/pipelines/:id");
export const PATCH = withObservability<Props>(handlePatch, "PATCH /api/v1/pipeline/pipelines/:id");
