import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { ok, unauthorized, badRequest, noContent } from "@/lib/pipeline/api";
import {
  listLeadContacts,
  addLeadContact,
  removeLeadContact,
} from "@/lib/pipeline/promote";

interface Props {
  params: Promise<{ id: string }>;
}

/** GET /api/v1/pipeline/leads/:id/contacts — contacts linked to the lead. */
async function handleGet(_request: NextRequest, { params }: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();
  const { id } = await params;
  try {
    const contacts = await listLeadContacts(supabase, id);
    return ok({ contacts });
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "Failed to load");
  }
}

/** POST /api/v1/pipeline/leads/:id/contacts  { contact_id, role? } */
async function handlePost(request: NextRequest, { params }: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();
  const { id } = await params;
  let body: { contact_id?: string; role?: string | null };
  try {
    body = (await request.json()) as { contact_id?: string; role?: string | null };
  } catch {
    return badRequest("Invalid JSON body");
  }
  if (!body.contact_id) return badRequest("contact_id is required");
  try {
    await addLeadContact(supabase, id, body.contact_id, body.role ?? null);
    const contacts = await listLeadContacts(supabase, id);
    return ok({ contacts });
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "Could not link contact");
  }
}

/** DELETE /api/v1/pipeline/leads/:id/contacts?contact_id=… */
async function handleDelete(request: NextRequest, { params }: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const contactId = request.nextUrl.searchParams.get("contact_id");
  if (!contactId) return badRequest("contact_id is required");
  try {
    await removeLeadContact(supabase, id, contactId);
    return noContent();
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "Could not unlink contact");
  }
}

export const GET = withObservability<Props>(handleGet, "GET /api/v1/pipeline/leads/:id/contacts");
export const POST = withObservability<Props>(handlePost, "POST /api/v1/pipeline/leads/:id/contacts");
export const DELETE = withObservability<Props>(handleDelete, "DELETE /api/v1/pipeline/leads/:id/contacts");
