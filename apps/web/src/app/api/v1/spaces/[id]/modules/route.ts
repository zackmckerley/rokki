import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { getModuleManifest } from "@rokki/sdk";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * GET  /api/v1/spaces/:id/modules
 *   → list modules installed on this space (archived = false). Returns
 *     each entry decorated with catalog info (name, icon) so the UI
 *     can render without a separate roundtrip.
 *
 * POST /api/v1/spaces/:id/modules { slug, config? }
 *   → install a module on this space. Permission check is enforced by
 *     `space_modules` RLS (owner/admin only). Returns 201 with the new
 *     row.
 *
 * Both endpoints rely entirely on RLS for authz — no extra checks
 * here. Per the API+MCP-parity non-negotiable, the same operations are
 * exposed as MCP tools `module.install` and `module.list_for_scope`.
 */

async function handleGet(_req: NextRequest, { params }: Props) {
  const { id: spaceId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { data, error } = await supabase
    .from("space_modules")
    .select(
      "id, slug, display_order, config, installed_by, installed_at, archived_at, modules_catalog(name, icon, scopes)",
    )
    .eq("space_id", spaceId)
    .is("archived_at", null)
    .order("display_order", { ascending: true });

  if (error) {
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: error.message }] },
      { status: 500 },
    );
  }
  return NextResponse.json({ data: data ?? [] });
}

async function handlePost(req: NextRequest, { params }: Props) {
  const { id: spaceId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  let body: { slug?: string; config?: Record<string, unknown> };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return badRequest("Invalid JSON body");
  }
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  if (!slug) return badRequest("`slug` is required");

  // Validate against the in-process manifest registry so a bogus slug
  // can't squeak past the catalog FK on a stale read. The catalog FK
  // is still the ultimate guard.
  const manifest = getModuleManifest(slug);
  if (manifest && !manifest.scopes.includes("space")) {
    return badRequest(`Module "${slug}" doesn't support space scope`);
  }

  // Idempotent install: if the row exists archived, unarchive it
  // instead of failing on the unique constraint. Reinstalling restores
  // the previous configuration intact (data layer never deletes).
  const { data: existingRaw } = await supabase
    .from("space_modules")
    .select("id, archived_at")
    .eq("space_id", spaceId)
    .eq("slug", slug)
    .maybeSingle();
  const existing = existingRaw as
    | { id: string; archived_at: string | null }
    | null;

  if (existing) {
    if (existing.archived_at) {
      const { data, error } = await supabase
        .from("space_modules")
        .update({ archived_at: null, config: body.config ?? {} } as never)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) return rlsOrErr(error);
      return NextResponse.json({ data }, { status: 200 });
    }
    return NextResponse.json(
      { errors: [{ code: "conflict", message: "Module already installed" }] },
      { status: 409 },
    );
  }

  const { data, error } = await supabase
    .from("space_modules")
    .insert({
      space_id: spaceId,
      slug,
      installed_by: user.id,
      config: body.config ?? {},
    } as never)
    .select()
    .single();
  if (error) return rlsOrErr(error);
  return NextResponse.json({ data }, { status: 201 });
}

function unauth() {
  return NextResponse.json(
    { errors: [{ code: "unauthenticated", message: "Sign in required" }] },
    { status: 401 },
  );
}

function badRequest(message: string) {
  return NextResponse.json(
    { errors: [{ code: "invalid_request", message }] },
    { status: 400 },
  );
}

function rlsOrErr(error: { message: string; code?: string }) {
  // RLS denials surface as code 42501 in PostgREST. Anything else is
  // a real server problem.
  if (error.code === "42501") {
    return NextResponse.json(
      {
        errors: [
          {
            code: "forbidden",
            message: "Only space owners or admins can install modules",
          },
        ],
      },
      { status: 403 },
    );
  }
  return NextResponse.json(
    { errors: [{ code: "internal_error", message: error.message }] },
    { status: 500 },
  );
}

export const GET = withObservability(handleGet, "GET /api/v1/spaces/[id]/modules");
export const POST = withObservability(
  handlePost,
  "POST /api/v1/spaces/[id]/modules",
);
