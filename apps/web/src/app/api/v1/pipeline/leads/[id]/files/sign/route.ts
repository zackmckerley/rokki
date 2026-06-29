import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { ok, unauthorized, badRequest } from "@/lib/pipeline/api";
import { LEAD_FILES_BUCKET } from "@/lib/pipeline/leadfiles";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/pipeline/leads/:id/files/sign?key=… — a short-lived signed URL to
 * download an attachment. The bucket's owner-only SELECT policy means a user can
 * only sign their own files.
 */
async function handleGet(request: NextRequest, _props: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const key = request.nextUrl.searchParams.get("key");
  if (!key) return badRequest("key is required");

  const { data, error } = await supabase.storage
    .from(LEAD_FILES_BUCKET)
    .createSignedUrl(key, 300);
  if (error || !data?.signedUrl) {
    return badRequest(error?.message ?? "Could not sign URL");
  }
  return ok({ url: data.signedUrl });
}

export const GET = withObservability<Props>(handleGet, "GET /api/v1/pipeline/leads/:id/files/sign");
