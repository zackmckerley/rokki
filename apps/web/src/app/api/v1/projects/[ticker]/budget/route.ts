import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveTerminalBySegment } from "@/lib/resolve-terminal";

import { withObservability } from "@/lib/observability";
interface Props {
  params: Promise<{ ticker: string }>;
}

/**
 * GET  /api/v1/projects/:ticker/budget
 * POST /api/v1/projects/:ticker/budget  { category, description?, amount_cents, status?, vendor_id?, incurred_on? }
 */
async function handleGet(_req: NextRequest, { params }: Props) {
  const { ticker } = await params;
  const supabase = await createClient();
  const terminal = await resolveTerminal(supabase, ticker);
  if (!terminal) return notFound();

  const { data } = await supabase
    .from("budget_items")
    .select(
      "id, category, description, amount_cents, currency, status, incurred_on, vendor_id, created_at, metadata",
    )
    .eq("terminal_id", terminal.id)
    .order("incurred_on", { ascending: false, nullsFirst: false })
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
    category?: string;
    description?: string;
    amount_cents?: number;
    currency?: string;
    status?: string;
    incurred_on?: string;
    vendor_id?: string;
  };

  if (!body.category || typeof body.amount_cents !== "number" || body.amount_cents < 0)
    return bad("category and non-negative amount_cents are required");

  const { data, error } = await supabase
    .from("budget_items")
    // @ts-expect-error Phase 0 generics
    .insert({
      terminal_id: terminal.id,
      category: body.category.slice(0, 80),
      description: body.description?.slice(0, 400) ?? null,
      amount_cents: Math.round(body.amount_cents),
      currency: body.currency ?? "USD",
      status: body.status ?? "planned",
      incurred_on: body.incurred_on ?? null,
      vendor_id: body.vendor_id ?? null,
      created_by: user.id,
    })
    .select(
      "id, category, description, amount_cents, currency, status, incurred_on, vendor_id, created_at",
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
  "GET /api/v1/projects/:ticker/budget",
);
export const POST = withObservability<Props>(
  handlePost,
  "POST /api/v1/projects/:ticker/budget",
);
