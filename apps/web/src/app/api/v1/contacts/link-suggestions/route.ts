import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { ok, unauthorized, badRequest } from "@/lib/contacts/api";
import { contactsDb } from "@/lib/contacts/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/contacts/link-suggestions
 *
 * The viewer's unlinked contacts whose email matches a Rokki account they do
 * NOT already share a space with (the auto-link trigger handles teammates).
 * Returns the contact + the matched account id so the client can offer "Link".
 * Only the caller's own contacts surface (the RPC scopes to auth.uid()).
 */
async function handleGet(_request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  try {
    const { data, error } = await supabase.rpc("contact_link_suggestions");
    if (error) return badRequest(error.message);
    const rows = (data ?? []) as { contact_id: string; user_id: string }[];
    if (rows.length === 0) return ok({ suggestions: [] });

    const ids = rows.map((r) => r.contact_id);
    const { data: contacts } = await contactsDb(supabase)
      .from("contacts")
      .select("id, first_name, last_name, nickname, primary_email")
      .in("id", ids);
    type C = {
      id: string;
      first_name: string | null;
      last_name: string | null;
      nickname: string | null;
      primary_email: string | null;
    };
    const byId = new Map((contacts as C[] | null)?.map((c) => [c.id, c]) ?? []);

    const suggestions = rows.map((r) => {
      const c = byId.get(r.contact_id);
      const name =
        c?.nickname?.trim() ||
        [c?.first_name, c?.last_name].filter(Boolean).join(" ").trim() ||
        c?.primary_email ||
        "Contact";
      return {
        contact_id: r.contact_id,
        user_id: r.user_id,
        name,
        email: c?.primary_email ?? null,
      };
    });
    return ok({ suggestions });
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "Failed to load suggestions");
  }
}

export const GET = withObservability(handleGet, "GET /api/v1/contacts/link-suggestions");
