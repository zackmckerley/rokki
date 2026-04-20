import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * GET  /api/v1/files/:id/share-links   — list links for this file
 * POST /api/v1/files/:id/share-links   — create one
 *   { label?, expires_in_days?, max_views?, require_email? }
 */

export async function GET(_req: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { data, error } = await supabase
    .from("share_links")
    .select(
      "id, token, label, created_at, expires_at, max_views, revoked_at, require_email",
    )
    .eq("file_id", id)
    .order("created_at", { ascending: false });
  if (error) return internal(error.message);

  // For each link, attach an access count so the caller can show "42 views".
  type Row = { id: string };
  const ids = ((data ?? []) as Row[]).map((r) => r.id);
  const counts: Record<string, { views: number; downloads: number }> = {};
  if (ids.length > 0) {
    const { data: acc } = await supabase
      .from("share_link_accesses")
      .select("share_link_id, kind")
      .in("share_link_id", ids);
    type A = { share_link_id: string; kind: "view" | "download" };
    for (const a of (acc ?? []) as A[]) {
      const c = counts[a.share_link_id] ?? { views: 0, downloads: 0 };
      if (a.kind === "view") c.views++;
      else c.downloads++;
      counts[a.share_link_id] = c;
    }
  }

  const decorated = (data ?? []).map((l) => ({
    ...(l as Record<string, unknown>),
    accesses: counts[(l as { id: string }).id] ?? { views: 0, downloads: 0 },
  }));
  return NextResponse.json({ data: decorated });
}

export async function POST(request: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const body = (await request.json().catch(() => ({}))) as {
    label?: string;
    expires_in_days?: number;
    max_views?: number;
    require_email?: boolean;
  };
  const days = Math.min(
    365,
    Math.max(1, Math.round(body.expires_in_days ?? 7)),
  );
  const expires = new Date(Date.now() + days * 86_400_000).toISOString();
  const token = crypto.randomBytes(24).toString("base64url");

  const { data, error } = await supabase
    .from("share_links")
    // @ts-expect-error generic insert collapses to never
    .insert({
      file_id: id,
      token,
      created_by: user.id,
      label: body.label ?? null,
      expires_at: expires,
      max_views: body.max_views ?? null,
      require_email: !!body.require_email,
    })
    .select("id, token, label, expires_at, max_views, require_email")
    .single();
  if (error) return internal(error.message);

  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/r/${(data as { token: string }).token}`;
  return NextResponse.json({ data: { ...(data as object), url } }, { status: 201 });
}

function unauth() {
  return NextResponse.json(
    { errors: [{ code: "unauthenticated", message: "Sign in required" }] },
    { status: 401 },
  );
}
function internal(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "internal_error", message: msg }] },
    { status: 500 },
  );
}
