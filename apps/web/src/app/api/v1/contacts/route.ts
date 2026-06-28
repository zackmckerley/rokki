import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { ok, unauthorized, badRequest } from "@/lib/contacts/api";
import {
  listContacts,
  createContact,
  findDuplicate,
} from "@/lib/contacts/queries";
import { primaryEmail, primaryPhone } from "@/lib/contacts/normalize";

export const dynamic = "force-dynamic";

/** GET /api/v1/contacts?q=&type=&tag=&status=&limit= — the viewer's contacts. */
async function handleGet(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const sp = request.nextUrl.searchParams;
  const status = sp.get("status");
  try {
    const contacts = await listContacts(supabase, user.id, {
      q: sp.get("q") ?? undefined,
      type: sp.get("type") ?? undefined,
      tag: sp.get("tag") ?? undefined,
      status: status === "archived" ? "archived" : "active",
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    });
    return ok({ contacts });
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "Failed to load contacts");
  }
}

/**
 * POST /api/v1/contacts — create a contact. Dedupe: if an active contact with
 * the same primary email/phone exists and `?force=true` isn't set, returns
 * `{ contact: null, duplicate }` (200) so the client can offer "open existing"
 * or retry with force.
 */
async function handlePost(request: NextRequest) {
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

  const force = request.nextUrl.searchParams.get("force") === "true";
  try {
    const email = primaryEmail(body.emails as never);
    const phone = primaryPhone(body.phones as never);
    if (!force) {
      const duplicate = await findDuplicate(supabase, user.id, email, phone);
      if (duplicate) return ok({ contact: null, duplicate });
    }
    const contact = await createContact(supabase, user.id, body);
    return ok({ contact, duplicate: null }, 201);
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "Could not create contact");
  }
}

export const GET = withObservability(handleGet, "GET /api/v1/contacts");
export const POST = withObservability(handlePost, "POST /api/v1/contacts");
