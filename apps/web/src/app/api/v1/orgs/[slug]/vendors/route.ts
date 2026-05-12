import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

import { withObservability } from "@/lib/observability";
interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * GET  /api/v1/orgs/:slug/vendors
 * POST /api/v1/orgs/:slug/vendors  { name, contact_name?, contact_email?, contact_phone?, website?, tags?, notes? }
 */
async function handleGet(_req: NextRequest, { params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const space = await resolveSpace(supabase, slug);
  if (!space) return notFound();

  const { data } = await supabase
    .from("vendors")
    .select(
      "id, name, contact_name, contact_email, contact_phone, website, tags, notes, created_at",
    )
    .eq("space_id", space.id)
    .order("name", { ascending: true });
  return NextResponse.json({ data: data ?? [] });
}

async function handlePost(request: NextRequest, { params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const space = await resolveSpace(supabase, slug);
  if (!space) return notFound();

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    contact_name?: string;
    contact_email?: string;
    contact_phone?: string;
    website?: string;
    tags?: string[];
    notes?: string;
  };
  if (!body.name) return bad("name is required");

  const { data, error } = await supabase
    .from("vendors")
    // @ts-expect-error Phase 0 generics
    .insert({
      space_id: space.id,
      name: body.name.slice(0, 200),
      contact_name: body.contact_name?.slice(0, 120) ?? null,
      contact_email: body.contact_email?.slice(0, 200) ?? null,
      contact_phone: body.contact_phone?.slice(0, 40) ?? null,
      website: body.website?.slice(0, 300) ?? null,
      tags: Array.isArray(body.tags)
        ? body.tags.filter((t): t is string => typeof t === "string").slice(0, 20)
        : [],
      notes: body.notes?.slice(0, 2000) ?? null,
      created_by: user.id,
    })
    .select(
      "id, name, contact_name, contact_email, contact_phone, website, tags, notes, created_at",
    )
    .single();
  if (error) return internal(error.message);
  return NextResponse.json({ data }, { status: 201 });
}

async function resolveSpace(
  supabase: Awaited<ReturnType<typeof createClient>>,
  slug: string,
) {
  const { data } = await supabase
    .from("spaces")
    .select("id")
    .eq("slug", slug.toLowerCase())
    .maybeSingle();
  return data as { id: string } | null;
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
    { errors: [{ code: "not_found", message: "Space not found" }] },
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
  "GET /api/v1/orgs/:slug/vendors",
);
export const POST = withObservability<Props>(
  handlePost,
  "POST /api/v1/orgs/:slug/vendors",
);
