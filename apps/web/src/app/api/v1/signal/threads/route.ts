import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { unauth, bad } from "@/lib/signal/responses";

/**
 * POST /api/v1/signal/threads { signalId, kind?, title? } — ensure a Signal
 * conversation exists for a contact and return its id, so the "new message"
 * picker can open a chat with someone who hasn't messaged yet. Idempotent
 * (upsert on user_id+signal_id). RLS scopes to the owner.
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
    title?: string;
  };
  if (!body.signalId) return bad("signalId is required");
  const kind = body.kind === "group" ? "group" : "direct";

  const row: {
    user_id: string;
    signal_id: string;
    kind: "direct" | "group";
    title?: string;
  } = { user_id: user.id, signal_id: body.signalId, kind };
  if (body.title) row.title = body.title;

  const { data, error } = await supabase
    .from("signal_threads")
    // @ts-expect-error generic upsert collapses to never
    .upsert(row, { onConflict: "user_id,signal_id" })
    .select("id")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { errors: [{ message: error?.message ?? "Couldn’t open the conversation" }] },
      { status: 500 },
    );
  }
  return NextResponse.json({ data: { id: (data as { id: string }).id } });
}

export const POST = withObservability(handlePost, "POST /api/v1/signal/threads");
