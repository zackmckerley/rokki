import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { bridgeSend } from "@/lib/signal/bridge";
import { ownsStorageKey } from "@/lib/signal/attachments";
import { unauth, bad, bridgeErrorResponse } from "@/lib/signal/responses";

// The bridge may spend up to ~90s downloading + staging attachments before it
// replies; give the serverless function headroom past that so it doesn't cut
// off before the bridge does.
export const maxDuration = 120;

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
    attachments?: {
      storage_key: string;
      content_type: string | null;
      filename: string | null;
      size: number | null;
    }[];
  };
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];
  if (!body.signalId || (!text && attachments.length === 0)) {
    return bad("signalId and text or attachments are required");
  }
  if (attachments.length > 20) return bad("too many attachments (max 20)");
  // Authorization: the bridge downloads each attachment with the Supabase
  // SERVICE ROLE (bypassing storage RLS), so the ONLY thing stopping a user
  // from sending — and thereby exfiltrating — another user's private media is
  // this ownership check. See ownsStorageKey for the tenant-boundary rationale.
  for (const a of attachments) {
    if (!ownsStorageKey(user.id, a?.storage_key)) {
      return bad("invalid attachment");
    }
  }
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
      attachments,
    });
    return NextResponse.json({ data: { ok: true } });
  } catch (e) {
    return bridgeErrorResponse(e);
  }
}

export const POST = withObservability(handlePost, "POST /api/v1/signal/send");
