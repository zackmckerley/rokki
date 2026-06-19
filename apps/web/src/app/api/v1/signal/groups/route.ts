import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { bridgeCreateGroup } from "@/lib/signal/bridge";
import { unauth, bad, bridgeErrorResponse } from "@/lib/signal/responses";

export const maxDuration = 60;

/**
 * POST /api/v1/signal/groups  { name, members: [signalId, …] }
 *
 * Create a new Signal group with the given members (their signal ids / numbers)
 * via the bridge. Returns the new Rokki thread id when signal-cli reports it
 * (otherwise the group surfaces on the next contact sync).
 */
async function handlePost(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    members?: string[];
  };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const members = Array.isArray(body.members)
    ? body.members.filter((m): m is string => typeof m === "string" && m.length > 0)
    : [];
  if (!name) return bad("a group name is required");
  if (members.length === 0) return bad("pick at least one member");
  if (members.length > 100) return bad("too many members (max 100)");

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
    const res = await bridgeCreateGroup(user.id, {
      signalNumber: acct.signal_number,
      name,
      members,
    });
    return NextResponse.json({ data: { threadId: res.threadId ?? null } });
  } catch (e) {
    return bridgeErrorResponse(e);
  }
}

export const POST = withObservability(handlePost, "POST /api/v1/signal/groups");
