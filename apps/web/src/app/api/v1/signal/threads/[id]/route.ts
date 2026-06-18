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
      "id, direction, sender, body, attachments, status, sent_at, edited_at, deleted_at",
    )
    .eq("thread_id", id)
    .is("deleted_at", null)
    .order("sent_at", { ascending: true });

  // Mint short-lived signed URLs so the client can render image previews /
  // download files without the bucket being public. Stored attachments carry a
  // `storage_key`; rows without attachments pass through untouched.
  type StoredAttachment = {
    storage_key?: string;
    content_type?: string | null;
    filename?: string | null;
    size?: number | null;
  };
  type Row = {
    attachments?: StoredAttachment[] | null;
    [k: string]: unknown;
  };
  const rows = (messages ?? []) as Row[];
  const enriched = await Promise.all(
    rows.map(async (m) => {
      const atts = Array.isArray(m.attachments) ? m.attachments : [];
      if (atts.length === 0) return m;
      const withUrls = await Promise.all(
        atts.map(async (a) => {
          if (!a.storage_key) return { ...a, url: null };
          const { data: signed } = await supabase.storage
            .from("signal-media")
            .createSignedUrl(a.storage_key, 60 * 60);
          return { ...a, url: signed?.signedUrl ?? null };
        }),
      );
      return { ...m, attachments: withUrls };
    }),
  );

  // Best-effort: mark this Signal thread read so its unread badge clears.
  await supabase
    .from("signal_threads")
    // @ts-expect-error generic update collapses to never
    .update({ last_read_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({
    data: { thread: thread ?? null, messages: enriched },
  });
}

export const GET = withObservability(
  handleGet,
  "GET /api/v1/signal/threads/:id",
);

/**
 * DELETE /api/v1/signal/threads/:id — remove a conversation from Rokki. RLS
 * scopes the delete to the owner; signal_messages cascade-delete via FK. This
 * only clears Rokki's local copy — it does NOT delete on Signal or the other
 * participant's device.
 */
async function handleDelete(_req: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { error } = await supabase.from("signal_threads").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ errors: [{ message: error.message }] }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}

export const DELETE = withObservability(
  handleDelete,
  "DELETE /api/v1/signal/threads/:id",
);
