import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { unauth } from "@/lib/signal/responses";

/**
 * GET /api/v1/signal/contacts — the signed-in user's synced Signal contacts +
 * groups (from signal_contacts). Drives the "new message" picker. RLS scopes
 * to the owner.
 */
async function handleGet() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { data } = await supabase
    .from("signal_contacts")
    .select("signal_id, kind, name")
    .eq("user_id", user.id)
    .order("name", { ascending: true });

  return NextResponse.json({ data: data ?? [] });
}

export const GET = withObservability(handleGet, "GET /api/v1/signal/contacts");
