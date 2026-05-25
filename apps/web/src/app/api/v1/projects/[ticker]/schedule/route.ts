import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveTerminalBySegment } from "@/lib/resolve-terminal";

import { withObservability } from "@/lib/observability";
interface Props {
  params: Promise<{ ticker: string }>;
}

/**
 * GET  /api/v1/projects/:ticker/schedule
 * POST /api/v1/projects/:ticker/schedule  { title, start_date, end_date, color?, depends_on? }
 */
async function handleGet(_req: NextRequest, { params }: Props) {
  const { ticker } = await params;
  const supabase = await createClient();
  const terminal = await resolveTerminal(supabase, ticker);
  if (!terminal) return notFound();

  const { data } = await supabase
    .from("schedule_phases")
    .select(
      "id, title, start_date, end_date, color, depends_on, position, created_at",
    )
    .eq("terminal_id", terminal.id)
    .order("start_date", { ascending: true })
    .order("position", { ascending: true });
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
    title?: string;
    start_date?: string;
    end_date?: string;
    color?: string;
    depends_on?: string;
  };
  if (!body.title || !body.start_date || !body.end_date)
    return bad("title, start_date, end_date are required (ISO yyyy-mm-dd)");
  if (body.end_date < body.start_date)
    return bad("end_date must be >= start_date");

  const { data, error } = await supabase
    .from("schedule_phases")
    // @ts-expect-error Phase 0 generics
    .insert({
      terminal_id: terminal.id,
      title: body.title.slice(0, 200),
      start_date: body.start_date,
      end_date: body.end_date,
      color: body.color?.slice(0, 20) ?? null,
      depends_on: body.depends_on ?? null,
      created_by: user.id,
    })
    .select(
      "id, title, start_date, end_date, color, depends_on, position, created_at",
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
  "GET /api/v1/projects/:ticker/schedule",
);
export const POST = withObservability<Props>(
  handlePost,
  "POST /api/v1/projects/:ticker/schedule",
);
