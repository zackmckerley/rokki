import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { ok, unauthorized, badRequest } from "@/lib/contacts/api";
import { getContact } from "@/lib/contacts/queries";
import { contactsDb } from "@/lib/contacts/db";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/contacts/:id/link  { user_id }
 *
 * Link a contact to a Rokki account. The DB function only succeeds when the
 * contact's primary_email actually matches the account's email, so a client
 * can't forge a link to an arbitrary user. Returns the updated contact.
 */
async function handlePost(request: NextRequest, { params }: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const { id } = await params;
  let body: { user_id?: string };
  try {
    body = (await request.json()) as { user_id?: string };
  } catch {
    return badRequest("Invalid JSON body");
  }
  if (!body.user_id) return badRequest("user_id is required");

  const { data, error } = await contactsDb(supabase).rpc("link_contact_to_user", {
    p_contact_id: id,
    p_user_id: body.user_id,
  });
  if (error) return badRequest(error.message);
  if (data !== true) {
    return badRequest("That account's email doesn't match this contact");
  }
  const contact = await getContact(supabase, user.id, id);
  return ok({ contact });
}

/**
 * DELETE /api/v1/contacts/:id/link — unlink the contact from its Rokki account
 * (clears `user_id`). The owner's record is otherwise untouched.
 */
async function handleDelete(_request: NextRequest, { params }: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const { error } = await contactsDb(supabase).rpc("unlink_contact", { p_contact_id: id });
  if (error) return badRequest(error.message);
  const contact = await getContact(supabase, user.id, id);
  return ok({ contact });
}

export const POST = withObservability<Props>(handlePost, "POST /api/v1/contacts/:id/link");
export const DELETE = withObservability<Props>(handleDelete, "DELETE /api/v1/contacts/:id/link");
