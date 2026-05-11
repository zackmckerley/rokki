import { NextResponse, type NextRequest } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { mentionedUserIds, renderMentionsAsText } from "@/lib/mentions";
import { sendEmail } from "@/lib/email";
import { withObservability } from "@/lib/observability";
import type { Database } from "@rokki/db";

/**
 * GET  /api/v1/comments?entity_type=task&entity_id=<uuid>
 *   → comments for that entity, oldest-first, with author display name.
 *
 * POST /api/v1/comments  { entity_type, entity_id, terminal_id, body, parent_id? }
 *   → inserts the comment; for every @mention, also inserts a notification
 *     row for the mentioned user (if they are a project member) and fires
 *     off an email via sendEmail (logs locally when no provider key).
 */

interface CommentRow {
  id: string;
  entity_type: string;
  entity_id: string;
  terminal_id: string;
  parent_id: string | null;
  body: string;
  mentions: string[];
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  created_by: string;
}

async function handleGet(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const url = new URL(request.url);
  const entityType = url.searchParams.get("entity_type");
  const entityId = url.searchParams.get("entity_id");
  if (!entityType || !entityId) return bad("entity_type and entity_id required");

  const { data, error } = await supabase
    .from("comments")
    .select(
      "id, entity_type, entity_id, terminal_id, parent_id, body, mentions, created_at, edited_at, deleted_at, created_by",
    )
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) return internal(error.message);

  const rows = (data ?? []) as CommentRow[];
  const authorIds = Array.from(new Set(rows.map((r) => r.created_by)));
  const { data: profiles } = authorIds.length
    ? await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", authorIds)
    : { data: [] };
  type P = { user_id: string; full_name: string | null; avatar_url: string | null };
  const byId = new Map(((profiles ?? []) as P[]).map((p) => [p.user_id, p]));

  const decorated = rows.map((r) => ({
    ...r,
    author: byId.get(r.created_by)
      ? {
          user_id: r.created_by,
          full_name: byId.get(r.created_by)!.full_name,
          avatar_url: byId.get(r.created_by)!.avatar_url,
        }
      : { user_id: r.created_by, full_name: null, avatar_url: null },
  }));

  return NextResponse.json({ data: decorated });
}

async function handlePost(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const body = (await request.json().catch(() => ({}))) as {
    entity_type?: string;
    entity_id?: string;
    terminal_id?: string;
    parent_id?: string;
    body?: string;
  };

  if (!body.entity_type || !body.entity_id || !body.terminal_id || !body.body) {
    return bad("entity_type, entity_id, terminal_id, body are all required");
  }
  const content = body.body.trim();
  if (content.length < 1 || content.length > 20_000)
    return bad("body must be 1–20,000 chars");

  const mentions = mentionedUserIds(content);

  const insert = await supabase
    .from("comments")
    // @ts-expect-error generated insert collapses to never
    .insert({
      entity_type: body.entity_type,
      entity_id: body.entity_id,
      terminal_id: body.terminal_id,
      parent_id: body.parent_id ?? null,
      body: content,
      mentions,
      created_by: user.id,
    })
    .select(
      "id, entity_type, entity_id, terminal_id, parent_id, body, mentions, created_at, created_by",
    )
    .single();
  const created = insert.data as
    | {
        id: string;
        terminal_id: string;
        entity_type: string;
        entity_id: string;
        created_by: string;
      }
    | null;
  if (insert.error || !created) {
    return internal(insert.error?.message ?? "insert failed");
  }

  // Mention notifications — only for mentioned users who are members of
  // the space and aren't the author themselves.
  if (mentions.length > 0) {
    const admin = createAdminClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: members } = await admin
      .from("terminal_members")
      .select("user_id")
      .eq("terminal_id", created.terminal_id)
      .in("user_id", mentions);
    const memberIds = ((members ?? []) as { user_id: string }[])
      .map((m) => m.user_id)
      .filter((id) => id !== user.id);

    if (memberIds.length > 0) {
      const { data: project } = await admin
        .from("terminals")
        .select("name, ticker")
        .eq("id", created.terminal_id)
        .single();
      const proj = (project ?? { name: "your space", ticker: "" }) as {
        name: string;
        ticker: string;
      };
      const { data: author } = await admin
        .from("profiles")
        .select("full_name")
        .eq("user_id", user.id)
        .maybeSingle();
      const authorName =
        (author as { full_name: string | null } | null)?.full_name ??
        user.email ??
        "Someone";

      const preview = renderMentionsAsText(content);
      const shortPreview =
        preview.length > 280 ? preview.slice(0, 280) + "…" : preview;
      const url = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/p/${proj.ticker}`;

      const notifRows = memberIds.map((uid) => ({
        user_id: uid,
        kind: "mention" as const,
        title: `${authorName} mentioned you in ${proj.name}`,
        body: shortPreview,
        entity_type: body.entity_type,
        entity_id: body.entity_id,
        terminal_id: created.terminal_id,
        actor_id: user.id,
        url,
      }));
      await admin
        .from("notifications")
        .insert(notifRows);

      // Look up emails for the mentioned users.
      const { data: authUsers } = await admin.auth.admin.listUsers();
      const usersById = new Map(
        (authUsers?.users ?? []).map((u) => [u.id, u]),
      );
      const emailTasks = memberIds
        .map((uid) => {
          const u = usersById.get(uid);
          const email = u?.email;
          if (!email) return null;
          return sendEmail({
            to: email,
            subject: `You were mentioned in ${proj.name}`,
            text: `${authorName} mentioned you in ${proj.name}:\n\n${shortPreview}\n\nOpen ${url}`,
          });
        })
        .filter(Boolean);
      await Promise.all(emailTasks);

      // Mark the notifications as emailed so a future re-send loop skips them.
      await admin
        .from("notifications")
        .update({ email_sent_at: new Date().toISOString() })
        .in("user_id", memberIds)
        .eq("entity_id", body.entity_id)
        .eq("kind", "mention")
        .is("email_sent_at", null);
    }
  }

  return NextResponse.json({ data: insert.data }, { status: 201 });
}

function unauth() {
  return NextResponse.json(
    { errors: [{ code: "unauthenticated", message: "Sign in required" }] },
    { status: 401 },
  );
}
function bad(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "invalid_request", message: msg }] },
    { status: 400 },
  );
}
function internal(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "internal_error", message: msg }] },
    { status: 500 },
  );
}

export const GET = withObservability(handleGet, "GET /api/v1/comments");
export const POST = withObservability(handlePost, "POST /api/v1/comments");
