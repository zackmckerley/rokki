import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

import { withObservability } from "@/lib/observability";
interface Props {
  params: Promise<{ fileId: string }>;
}

/**
 * GET  /api/v1/drawings/:fileId/annotations    — list all annotations on a drawing
 * POST /api/v1/drawings/:fileId/annotations    — create { page_number, x_pct, y_pct, body, color? }
 *
 * RLS scopes this to members of the file's terminal.
 */
async function handleGet(_req: NextRequest, { params }: Props) {
  const { fileId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { data, error } = await supabase
    .from("drawing_annotations")
    .select(
      "id, page_number, x_pct, y_pct, body, color, created_by, created_at, resolved_at",
    )
    .eq("file_id", fileId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) return internal(error.message);

  type Row = {
    id: string;
    page_number: number;
    x_pct: number;
    y_pct: number;
    body: string;
    color: string;
    created_by: string;
    created_at: string;
    resolved_at: string | null;
  };
  const rows = (data ?? []) as Row[];
  const authorIds = Array.from(new Set(rows.map((r) => r.created_by)));
  const { data: profiles } = authorIds.length
    ? await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", authorIds)
    : { data: [] };
  type P = { user_id: string; full_name: string | null };
  const nameById = new Map(
    ((profiles ?? []) as P[]).map((p) => [p.user_id, p.full_name]),
  );
  return NextResponse.json({
    data: rows.map((r) => ({
      ...r,
      author_name: nameById.get(r.created_by) ?? null,
    })),
  });
}

async function handlePost(request: NextRequest, { params }: Props) {
  const { fileId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const body = (await request.json().catch(() => ({}))) as {
    page_number?: number;
    x_pct?: number;
    y_pct?: number;
    body?: string;
    color?: "accent" | "success" | "warning" | "danger";
  };
  const { page_number, x_pct, y_pct, body: text, color } = body;
  if (
    typeof page_number !== "number" ||
    page_number < 1 ||
    typeof x_pct !== "number" ||
    x_pct < 0 ||
    x_pct > 1 ||
    typeof y_pct !== "number" ||
    y_pct < 0 ||
    y_pct > 1 ||
    !text ||
    text.length < 1 ||
    text.length > 4000
  ) {
    return bad(
      "page_number >=1, x_pct/y_pct in [0,1], body 1–4000 chars are required",
    );
  }

  const { data, error } = await supabase
    .from("drawing_annotations")
    // @ts-expect-error generic insert collapses to never
    .insert({
      file_id: fileId,
      page_number,
      x_pct,
      y_pct,
      body: text,
      color: color ?? "accent",
      created_by: user.id,
    })
    .select("id, page_number, x_pct, y_pct, body, color, created_at")
    .single();
  if (error) return internal(error.message);
  return NextResponse.json({ data }, { status: 201 });
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

export const GET = withObservability<Props>(
  handleGet,
  "GET /api/v1/drawings/:fileId/annotations",
);
export const POST = withObservability<Props>(
  handlePost,
  "POST /api/v1/drawings/:fileId/annotations",
);
