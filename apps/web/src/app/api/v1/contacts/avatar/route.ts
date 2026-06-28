import { type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { ok, unauthorized, badRequest, internal } from "@/lib/contacts/api";
import {
  AVATAR_BUCKET,
  AVATAR_MAX_BYTES,
  imageExtFromType,
  avatarStorageKey,
} from "@/lib/contacts/avatar";

export const dynamic = "force-dynamic";
// Profile pictures are small, but give image processing a little headroom.
export const maxDuration = 30;

/**
 * POST /api/v1/contacts/avatar  (multipart/form-data, field `file`)
 *
 * Uploads a profile picture to the public `contact-avatars` bucket under
 * `<userId>/<uuid>.<ext>` and returns its public URL. The client stores that
 * URL on the contact's `avatar_url` via the normal create/update call — this
 * route only handles the binary. The bucket's owner-only write RLS authorizes
 * the upload because the key is prefixed with the caller's id.
 */
async function handlePost(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return badRequest("file is required");
  if (file.size === 0) return badRequest("file is empty");
  if (file.size > AVATAR_MAX_BYTES) return badRequest("image too large (max 8 MB)");

  const ext = imageExtFromType(file.type);
  if (!ext) return badRequest("unsupported image type");

  const key = avatarStorageKey(user.id, randomUUID(), ext);
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(key, bytes, { contentType: file.type, upsert: false });
  if (error) return internal(error.message);

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(key);
  return ok({ url: data.publicUrl, key }, 201);
}

export const POST = withObservability(handlePost, "POST /api/v1/contacts/avatar");
