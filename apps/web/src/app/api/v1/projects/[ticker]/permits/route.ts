import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveTerminalBySegment } from "@/lib/resolve-terminal";

import { withObservability } from "@/lib/observability";
interface Props {
  params: Promise<{ ticker: string }>;
}

/**
 * GET  /api/v1/projects/:ticker/permits
 * POST /api/v1/projects/:ticker/permits  { kind, number?, authority?, status?, applied_on?, expires_on? }
 */
async function handleGet(_req: NextRequest, { params }: Props) {
  const { ticker } = await params;
  const supabase = await createClient();
  const terminal = await resolveTerminal(supabase, ticker);
  if (!terminal) return notFound();

  const { data } = await supabase
    .from("permits")
    .select(
      "id, number, kind, authority, status, applied_on, issued_on, expires_on, notes, created_at",
    )
    .eq("terminal_id", terminal.id)
    .order("expires_on", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  return NextResponse.json({ data: data ?? [] });
}

async function handlePost(request: NextRequest, { params }: Props) {
  const { ticker } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const terminal = await resolveTerminal(supabase, ticker);
  if (!terminal) return notFound();

  const body = (await request.json().catch(() => ({}))) as {
    kind?: string;
    number?: string;
    authority?: string;
    status?: string;
    applied_on?: string;
    issued_on?: string;
    expires_on?: string;
    notes?: string;
  };
  if (!body.kind) return bad("kind is required");

  const { data, error } = await supabase
    .from("permits")
    // @ts-expect-error Phase 0 generics
    .insert({
      terminal_id: terminal.id,
      kind: body.kind.slice(0, 80),
      number: body.number?.slice(0, 80) ?? null,
      authority: body.authority?.slice(0, 120) ?? null,
      status: body.status ?? "applied",
      applied_on: body.applied_on ?? null,
      issued_on: body.issued_on ?? null,
      expires_on: body.expires_on ?? null,
      notes: body.notes?.slice(0, 1000) ?? null,
      created_by: user.id,
    })
    .select(
      "id, number, kind, authority, status, applied_on, issued_on, expires_on, notes, created_at",
    )
    .single();
  if (error) return internal(error.message);
  return NextResponse.json({ data }, { status: 201 });
}

async function resolveTerminal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ticker: string,
) {
  return resolveTerminalBySegment(supabase, ticker);
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
function notFound() {
  return NextResponse.json(
    { errors: [{ code: "not_found", message: "Terminal not found" }] },
    { status: 404 },
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
  "GET /api/v1/projects/:ticker/permits",
);
export const POST = withObservability<Props>(
  handlePost,
  "POST /api/v1/projects/:ticker/permits",
);
