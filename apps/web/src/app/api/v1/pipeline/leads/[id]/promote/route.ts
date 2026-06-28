import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { ok, unauthorized, badRequest } from "@/lib/pipeline/api";
import { promoteLead } from "@/lib/pipeline/promote";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/pipeline/leads/:id/promote — promote a lead to a Terminal.
 * Creates the terminal in the lead's space, carries the lead's contacts over,
 * and marks the lead converted. Returns the new terminal.
 */
async function handlePost(_request: NextRequest, { params }: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();
  const { id } = await params;
  try {
    const result = await promoteLead(supabase, id, user.id);
    return ok(result, 201);
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "Could not promote lead");
  }
}

export const POST = withObservability<Props>(handlePost, "POST /api/v1/pipeline/leads/:id/promote");
