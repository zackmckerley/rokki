import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { ok, unauthorized, badRequest, errResponse } from "@/lib/contacts/api";
import { getContact } from "@/lib/contacts/queries";
import { contactsDb } from "@/lib/contacts/db";
import { rateLimitCheck } from "@/lib/ratelimit";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/contacts/:id/link
 *
 * Link the caller's contact to whatever confirmed Rokki account its email
 * resolves to. No body — the server picks the account by email, so the client
 * never supplies or learns an account id (nothing to forge, no id oracle).
 * Rate-limited to blunt bulk email-probing.
 */
async function handlePost(request: NextRequest, { params }: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const rl = await rateLimitCheck({
    bucket: "contacts_link",
    token: user.id,
    max: 30,
    windowSeconds: 60,
  });
  if (!rl.ok) return errResponse("rate_limited", "Too many link attempts", 429);

  const { id } = await params;
  const { data, error } = await contactsDb(supabase).rpc("link_contact_by_email", {
    p_contact_id: id,
  });
  if (error) return badRequest(error.message);
  if (data !== true) {
    return badRequest("No Rokki account matches this contact's email");
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
