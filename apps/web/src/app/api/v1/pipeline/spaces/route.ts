import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { ok, unauthorized, badRequest } from "@/lib/pipeline/api";
import { listSpacesForUser } from "@/lib/pipeline/queries";

export const dynamic = "force-dynamic";

/** GET /api/v1/pipeline/spaces — the spaces the viewer can run a pipeline in. */
async function handleGet(_request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();
  try {
    const spaces = await listSpacesForUser(supabase);
    return ok({ spaces });
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "Failed to load spaces");
  }
}

export const GET = withObservability(handleGet, "GET /api/v1/pipeline/spaces");
