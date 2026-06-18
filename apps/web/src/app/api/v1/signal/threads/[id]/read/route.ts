import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { bridgeMarkRead } from "@/lib/signal/bridge";
import { unauth, bridgeErrorResponse } from "@/lib/signal/responses";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/signal/threads/:id/read — send read receipts for the inbound
 * messages in a direct thread (so the other person's app shows ✓✓). Fired when
 * the user opens the conversation. Groups are skipped (Signal doesn't do
 * per-message group read receipts). RLS scopes the thread/messages to the owner.
 */
async function handlePost(_req: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { data: acct } = await supabase
    .from("signal_accounts")
    .select("signal_number, status")
    .eq("user_id", user.id)
    .maybeSingle();
  const a = acct as { signal_number?: string | null; status?: string } | null;
  if (!a?.signal_number || a.status !== "active") {
    return NextResponse.json({ data: { ok: false } });
  }

  const { data: thread } = await supabase
    .from("signal_threads")
    .select("signal_id, kind")
    .eq("id", id)
    .maybeSingle();
  const t = thread as { signal_id?: string; kind?: string } | null;
  // Direct chats only — no per-message read receipts for groups.
  if (!t?.signal_id || t.kind !== "direct") {
    return NextResponse.json({ data: { ok: true } });
  }

  const { data: msgs } = await supabase
    .from("signal_messages")
    .select("external_id")
    .eq("thread_id", id)
    .eq("direction", "in")
    .order("sent_at", { ascending: false })
    .limit(100);
  const timestamps = ((msgs ?? []) as { external_id: string | null }[])
    .map((m) => Number(m.external_id))
    .filter((n) => Number.isFinite(n));
  if (timestamps.length === 0) return NextResponse.json({ data: { ok: true } });

  try {
    await bridgeMarkRead(user.id, {
      signalNumber: a.signal_number,
      recipient: t.signal_id,
      timestamps,
    });
    return NextResponse.json({ data: { ok: true } });
  } catch (e) {
    return bridgeErrorResponse(e);
  }
}

export const POST = withObservability(
  handlePost,
  "POST /api/v1/signal/threads/:id/read",
);
