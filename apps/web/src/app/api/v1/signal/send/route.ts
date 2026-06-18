import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { bridgeSend } from "@/lib/signal/bridge";
import { unauth, bad, bridgeErrorResponse } from "@/lib/signal/responses";

// signal-cli boots a JVM per send; give the serverless function headroom past
// the default so it doesn't cut off before the bridge replies.
export const maxDuration = 60;

/**
 * POST /api/v1/signal/send  { signalId, kind?, text }
 *
 * Send a message through the signed-in user's linked Signal account. We look
 * up their own Signal number server-side; the caller only names the target
 * conversation (`signalId` = recipient number/uuid for a direct chat, or a
 * group id when `kind: "group"`).
 */

async function handlePost(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const body = (await request.json().catch(() => ({}))) as {
    signalId?: string;
    kind?: "direct" | "group";
    text?: string;
  };
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!body.signalId || !text) return bad("signalId and text are required");
  const kind = body.kind === "group" ? "group" : "direct";

  const { data: account } = await supabase
    .from("signal_accounts")
    .select("signal_number, status")
    .eq("user_id", user.id)
    .maybeSingle();
  const acct = account as {
    signal_number?: string | null;
    status?: string;
  } | null;
  if (!acct || acct.status !== "active" || !acct.signal_number) {
    return bad("Signal isn't connected");
  }

  try {
    await bridgeSend(user.id, {
      signalNumber: acct.signal_number,
      signalId: body.signalId,
      kind,
      text,
    });
    return NextResponse.json({ data: { ok: true } });
  } catch (e) {
    return bridgeErrorResponse(e);
  }
}

export const POST = withObservability(handlePost, "POST /api/v1/signal/send");
