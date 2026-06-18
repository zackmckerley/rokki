import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { unauth } from "@/lib/signal/responses";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/signal/threads/:id — the thread + its messages, oldest first.
 * RLS scopes signal_threads / signal_messages to the owner, so a thread that
 * isn't yours simply returns null/[].
 */
async function handleGet(_req: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { data: thread } = await supabase
    .from("signal_threads")
    .select("id, signal_id, kind, title, muted, sync_enabled, last_message_at")
    .eq("id", id)
    .maybeSingle();

  const { data: messages } = await supabase
    .from("signal_messages")
    .select(
      "id, direction, sender, body, attachments, sent_at, edited_at, deleted_at",
    )
    .eq("thread_id", id)
    .is("deleted_at", null)
    .order("sent_at", { ascending: true });

  return NextResponse.json({
    data: { thread: thread ?? null, messages: messages ?? [] },
  });
}

export const GET = withObservability(
  handleGet,
  "GET /api/v1/signal/threads/:id",
);
