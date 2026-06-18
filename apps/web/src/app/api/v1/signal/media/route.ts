import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { unauth, bad } from "@/lib/signal/responses";

// Allow a comfortable window for larger files to stream up.
export const maxDuration = 60;

const MEDIA_BUCKET = "signal-media";
const MAX_BYTES = 100 * 1024 * 1024; // 100 MB — Signal's own attachment ceiling.

/**
 * POST /api/v1/signal/media  (multipart/form-data, field `file`)
 *
 * Stage an outbound attachment in Supabase Storage before sending. Returns the
 * storage metadata the caller then passes to /api/v1/signal/send as one of
 * `attachments[]`. Files land under `<userId>/outgoing/<uuid>` so the
 * per-user storage RLS policy authorizes the write.
 */
async function handlePost(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return bad("file is required");
  if (file.size === 0) return bad("file is empty");
  if (file.size > MAX_BYTES) return bad("file too large (max 100 MB)");

  const key = `${user.id}/outgoing/${randomUUID()}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";

  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(key, bytes, { contentType, upsert: true });
  if (error) {
    return NextResponse.json(
      { errors: [{ message: error.message }] },
      { status: 502 },
    );
  }

  return NextResponse.json({
    data: {
      storage_key: key,
      content_type: contentType,
      filename: file.name || null,
      size: file.size,
    },
  });
}

export const POST = withObservability(handlePost, "POST /api/v1/signal/media");
