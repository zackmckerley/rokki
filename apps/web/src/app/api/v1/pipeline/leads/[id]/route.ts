import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { ok, unauthorized, badRequest, notFound, noContent } from "@/lib/pipeline/api";
import { getLead, updateLead, deleteLead } from "@/lib/pipeline/queries";

interface Props {
  params: Promise<{ id: string }>;
}

/** GET /api/v1/pipeline/leads/:id — one lead. */
async function handleGet(_request: NextRequest, { params }: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const lead = await getLead(supabase, id);
  if (!lead) return notFound("Lead not found");
  return ok({ lead });
}

/**
 * PATCH /api/v1/pipeline/leads/:id — update a lead (stage move, status change,
 * follow-up, fields). A stage/status change bumps last_activity_at.
 */
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
    const lead = await updateLead(supabase, id, body);
    if (!lead) return notFound("Lead not found");
    return ok({ lead });
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "Could not update lead");
  }
}

/** DELETE /api/v1/pipeline/leads/:id — remove a lead. */
async function handleDelete(_request: NextRequest, { params }: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();
  const { id } = await params;
  try {
    await deleteLead(supabase, id);
    return noContent();
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "Could not delete lead");
  }
}

export const GET = withObservability<Props>(handleGet, "GET /api/v1/pipeline/leads/:id");
export const PATCH = withObservability<Props>(handlePatch, "PATCH /api/v1/pipeline/leads/:id");
export const DELETE = withObservability<Props>(handleDelete, "DELETE /api/v1/pipeline/leads/:id");
