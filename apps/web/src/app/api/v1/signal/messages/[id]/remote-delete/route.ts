import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { bridgeRemoteDelete } from "@/lib/signal/bridge";
import { unauth, bad, bridgeErrorResponse } from "@/lib/signal/responses";

export const maxDuration = 30;

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/signal/messages/:id/remote-delete — delete a message for
 * EVERYONE on Signal (remote delete). Only your own (direction=out) messages
 * qualify. The bridge issues the Signal remote-delete and soft-deletes the row;
 * the other party's device removes it too.
 */
async function handlePost(_req: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { data: message } = await supabase
    .from("signal_messages")
    .select("external_id, direction, thread_id")
    .eq("id", id)
    .maybeSingle();
  const m = message as {
    external_id?: string;
    direction?: string;
    thread_id?: string;
  } | null;
  if (!m) return bad("message not found");
  if (m.direction !== "out") {
    return bad("you can only delete-for-everyone messages you sent");
  }
  if (!m.external_id || !m.thread_id) {
    return bad("this message can't be remote-deleted");
  }
  const targetTimestamp = Number(m.external_id);
  if (!Number.isFinite(targetTimestamp)) return bad("invalid message timestamp");

  const { data: thread } = await supabase
    .from("signal_threads")
    .select("signal_id, kind")
    .eq("id", m.thread_id)
    .maybeSingle();
  const t = thread as { signal_id?: string; kind?: string } | null;
  if (!t?.signal_id) return bad("conversation not found");

  const { data: account } = await supabase
    .from("signal_accounts")
    .select("signal_number, status")
    .eq("user_id", user.id)
    .maybeSingle();
  const acct = account as { signal_number?: string; status?: string } | null;
  if (!acct?.signal_number || acct.status !== "active") {
    return bad("Signal isn't connected");
  }

  try {
    await bridgeRemoteDelete(user.id, {
      signalNumber: acct.signal_number,
      signalId: t.signal_id,
      kind: t.kind === "group" ? "group" : "direct",
      targetTimestamp,
    });
    return NextResponse.json({ data: { ok: true } });
  } catch (e) {
    return bridgeErrorResponse(e);
  }
}

export const POST = withObservability(
  handlePost,
  "POST /api/v1/signal/messages/:id/remote-delete",
);
