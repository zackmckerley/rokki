import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { isSignalBridgeConfigured } from "@/lib/signal/bridge";
import { unauth, internal } from "@/lib/signal/responses";

/**
 * GET    /api/v1/signal/account — my Signal link status + synced-thread count.
 * DELETE /api/v1/signal/account — disconnect (mark unlinked).
 *
 * Scoped to the signed-in user. The bridge writes the row via the service
 * role; RLS lets the owner read/update their own row here.
 */

async function handleGet() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { data: account } = await supabase
    .from("signal_accounts")
    .select("status, signal_number, device_id, linked_at, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const { count } = await supabase
    .from("signal_threads")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const acct = account as {
    status?: string;
    signal_number?: string | null;
    linked_at?: string | null;
  } | null;

  return NextResponse.json({
    data: {
      status: acct?.status ?? "unlinked",
      signal_number: acct?.signal_number ?? null,
      linked_at: acct?.linked_at ?? null,
      thread_count: count ?? 0,
      configured: isSignalBridgeConfigured(),
    },
  });
}

async function handleDelete() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { error } = await supabase
    .from("signal_accounts")
    // @ts-expect-error generic update collapses to never
    .update({ status: "unlinked" })
    .eq("user_id", user.id);
  if (error) return internal(error.message);

  return new NextResponse(null, { status: 204 });
}

export const GET = withObservability(handleGet, "GET /api/v1/signal/account");
export const DELETE = withObservability(
  handleDelete,
  "DELETE /api/v1/signal/account",
);
