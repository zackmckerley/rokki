import { type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { ok, unauthorized, badRequest, notFound, internal } from "@/lib/pipeline/api";
import { getLead, updateLead } from "@/lib/pipeline/queries";
import {
  LEAD_FILES_BUCKET,
  LEAD_FILE_MAX_BYTES,
  extFromName,
  leadFileKey,
  type LeadFile,
} from "@/lib/pipeline/leadfiles";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Props {
  params: Promise<{ id: string }>;
}

function filesOf(attributes: Record<string, unknown> | undefined): LeadFile[] {
  const f = attributes?.files;
  return Array.isArray(f) ? (f as LeadFile[]) : [];
}

/** GET /api/v1/pipeline/leads/:id/files — the lead's attached files. */
async function handleGet(_request: NextRequest, { params }: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const lead = await getLead(supabase, id);
  if (!lead) return notFound("Lead not found");
  return ok({ files: filesOf(lead.attributes) });
}

/** POST /api/v1/pipeline/leads/:id/files (multipart `file`) — upload + attach. */
async function handlePost(request: NextRequest, { params }: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const lead = await getLead(supabase, id);
  if (!lead) return notFound("Lead not found");

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return badRequest("file is required");
  if (file.size === 0) return badRequest("file is empty");
  if (file.size > LEAD_FILE_MAX_BYTES) return badRequest("file too large (max 25 MB)");

  const key = leadFileKey(user.id, id, randomUUID(), extFromName(file.name));
  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";

  const { error: upErr } = await supabase.storage
    .from(LEAD_FILES_BUCKET)
    .upload(key, bytes, { contentType, upsert: false });
  if (upErr) return internal(upErr.message);

  const entry: LeadFile = {
    key,
    name: file.name || "file",
    size: file.size,
    type: contentType,
    uploaded_at: new Date().toISOString(),
  };
  const files = [...filesOf(lead.attributes), entry];
  await updateLead(supabase, id, { attributes: { ...lead.attributes, files } });
  return ok({ files }, 201);
}

/** DELETE /api/v1/pipeline/leads/:id/files?key=… — remove an attachment. */
async function handleDelete(request: NextRequest, { params }: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const key = request.nextUrl.searchParams.get("key");
  if (!key) return badRequest("key is required");

  const lead = await getLead(supabase, id);
  if (!lead) return notFound("Lead not found");

  // Only delete a key that actually belongs to THIS lead. Storage RLS only
  // checks the `<userId>/` prefix, so without this a caller could pass another
  // lead's key and delete its bytes. Require both the user+lead prefix AND that
  // the key is one of this lead's recorded files.
  const current = filesOf(lead.attributes);
  if (!key.startsWith(`${user.id}/${id}/`) || !current.some((f) => f.key === key)) {
    return badRequest("key does not belong to this lead");
  }

  await supabase.storage.from(LEAD_FILES_BUCKET).remove([key]);
  const files = current.filter((f) => f.key !== key);
  await updateLead(supabase, id, { attributes: { ...lead.attributes, files } });
  return ok({ files });
}

export const GET = withObservability<Props>(handleGet, "GET /api/v1/pipeline/leads/:id/files");
export const POST = withObservability<Props>(handlePost, "POST /api/v1/pipeline/leads/:id/files");
export const DELETE = withObservability<Props>(handleDelete, "DELETE /api/v1/pipeline/leads/:id/files");
