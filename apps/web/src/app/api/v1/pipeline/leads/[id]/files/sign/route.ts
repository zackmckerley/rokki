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
async function handleGet(request: NextRequest, props: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const { id: leadId } = await props.params;
  const key = request.nextUrl.searchParams.get("key");
  if (!key) return badRequest("key is required");
  // Scope the key to this user + lead; don't sign an arbitrary storage path.
  if (!key.startsWith(`${user.id}/${leadId}/`)) {
    return badRequest("key does not belong to this lead");
  }

  // `download: true` forces Content-Disposition: attachment, so an uploaded
  // HTML/SVG downloads instead of rendering inline on the storage origin
  // (prevents stored-XSS via a signed lead-file URL).
  const { data, error } = await supabase.storage
    .from(LEAD_FILES_BUCKET)
    .createSignedUrl(key, 300, { download: true });
  if (error || !data?.signedUrl) {
    return badRequest(error?.message ?? "Could not sign URL");
  }
  return ok({ url: data.signedUrl });
}

export const GET = withObservability<Props>(handleGet, "GET /api/v1/pipeline/leads/:id/files/sign");
