import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { ok, unauthorized, badRequest, errResponse } from "@/lib/contacts/api";
import { contactsDb } from "@/lib/contacts/db";
import { rateLimitCheck } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/contacts/link-suggestions
 *
 * The viewer's unlinked contacts whose email matches a confirmed Rokki account
 * they don't already share a space with (teammates are auto-linked). Returns
 * only the contact (id + name) — never the matched account id — so it can't be
 * used as an email→account-id oracle. The RPC scopes to auth.uid(); the route
 * is rate-limited to blunt bulk email-probing.
 */
async function handleGet(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const rl = await rateLimitCheck({
    bucket: "contacts_link_suggestions",
    token: user.id,
    max: 60,
    windowSeconds: 60,
  });
  if (!rl.ok) return errResponse("rate_limited", "Too many requests", 429);

  try {
    const { data, error } = await contactsDb(supabase).rpc("contact_link_suggestions");
    if (error) return badRequest(error.message);
    const rows = (data ?? []) as { contact_id: string }[];
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
      return { contact_id: r.contact_id, name, email: c?.primary_email ?? null };
    });
    return ok({ suggestions });
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "Failed to load suggestions");
  }
}

export const GET = withObservability(handleGet, "GET /api/v1/contacts/link-suggestions");
