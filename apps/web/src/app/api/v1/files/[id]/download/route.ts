import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getObjectStream } from "@/lib/storage";

import { withObservability } from "@/lib/observability";
interface Props {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/files/:id/download — streams the file back to the caller,
 * enforcing RLS via the file's visibility policy. Phase 1: simple proxy.
 * Phase 2 will redirect to a signed URL for direct-to-storage download.
 */
async function handleGet(_req: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { data } = await supabase
    .from("files")
    .select(
      "id, filename, mime_type, blob_key, size_bytes, deleted_at, virus_scan_status",
    )
    .eq("id", id)
    .maybeSingle();

  const file = data as
    | {
        id: string;
        filename: string;
        mime_type: string;
        blob_key: string;
        size_bytes: number;
        deleted_at: string | null;
        virus_scan_status: "pending" | "clean" | "infected" | "skipped";
      }
    | null;

  if (!file || file.deleted_at) return notFound();

  // Block downloads for infected files. Pending files return 202 so the UI
  // can show "Scanning..." and retry — acceptance test 11.3.5 relies on
  // this state being visible.
  if (file.virus_scan_status === "infected") {
    return NextResponse.json(
      {
        errors: [
          {
            code: "virus_detected",
            message:
              "This file was flagged by virus scanning. Contact an admin.",
          },
        ],
      },
      { status: 403 },
    );
  }
  if (file.virus_scan_status === "pending") {
    return NextResponse.json(
      {
        errors: [
          {
            code: "scan_pending",
            message: "File is still being scanned. Try again in a moment.",
          },
        ],
      },
      { status: 202 },
    );
  }

  try {
    const obj = await getObjectStream(file.blob_key);
    const headers = new Headers({
      "Content-Type": file.mime_type || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(file.filename)}"`,
      "Cache-Control": "private, max-age=0",
    });
    if (typeof obj.contentLength === "number") {
      headers.set("Content-Length", String(obj.contentLength));
    }
    return new NextResponse(obj.body as unknown as BodyInit, { headers });
  } catch (e) {
    return internal(
      e instanceof Error ? `storage read failed: ${e.message}` : "storage read failed",
    );
  }
}

function unauth() {
  return NextResponse.json(
    { errors: [{ code: "unauthenticated", message: "Sign in required" }] },
    { status: 401 },
  );
}
function notFound() {
  return NextResponse.json(
    { errors: [{ code: "not_found", message: "File not found" }] },
    { status: 404 },
  );
}
function internal(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "internal_error", message: msg }] },
    { status: 500 },
  );
}

export const GET = withObservability<Props>(
  handleGet,
  "GET /api/v1/files/:id/download",
);
