import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { ok, noContent, unauthorized, badRequest, notFound } from "@/lib/contacts/api";
import {
  getContact,
  updateContact,
  archiveContact,
} from "@/lib/contacts/queries";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

/** GET /api/v1/contacts/:id */
async function handleGet(_request: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();
  try {
    const contact = await getContact(supabase, user.id, id);
    if (!contact) return notFound("Contact not found");
    return ok({ contact });
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "Failed");
  }
}

/** PATCH /api/v1/contacts/:id */
async function handlePatch(request: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return badRequest("Invalid JSON body");
  }
  try {
    const contact = await updateContact(supabase, user.id, id, body);
    if (!contact) return notFound("Contact not found");
    return ok({ contact });
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "Could not update contact");
  }
}

/** DELETE /api/v1/contacts/:id — soft archive. */
async function handleDelete(_request: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();
  try {
    await archiveContact(supabase, user.id, id);
    return noContent();
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "Could not archive contact");
  }
}

export const GET = withObservability<Props>(handleGet, "GET /api/v1/contacts/:id");
export const PATCH = withObservability<Props>(handlePatch, "PATCH /api/v1/contacts/:id");
export const DELETE = withObservability<Props>(handleDelete, "DELETE /api/v1/contacts/:id");
