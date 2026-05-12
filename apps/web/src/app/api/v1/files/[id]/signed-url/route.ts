import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSignedDownloadUrl } from "@/lib/storage";

import { withObservability } from "@/lib/observability";
interface Props {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/files/:id/signed-url
 *
 * Returns a short-lived signed URL the browser can use to load a file
 * directly from storage — used for inline PDF viewing and image previews.
 *
 * RLS ensures the caller can see the file before we hand out a URL.
 */
async function handleGet(_req: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(
      { errors: [{ code: "unauthenticated", message: "Sign in required" }] },
      { status: 401 },
    );

  const { data } = await supabase
    .from("files")
    .select("id, blob_key, mime_type, filename")
    .eq("id", id)
    .maybeSingle();
  const file = data as
    | { id: string; blob_key: string; mime_type: string; filename: string }
    | null;
  if (!file)
    return NextResponse.json(
      { errors: [{ code: "not_found", message: "File not found" }] },
      { status: 404 },
    );

  const url = await getSignedDownloadUrl(file.blob_key, 300);
  return NextResponse.json({
    data: { url, mime_type: file.mime_type, filename: file.filename },
  });
}

export const GET = withObservability<Props>(
  handleGet,
  "GET /api/v1/files/:id/signed-url",
);
