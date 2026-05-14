import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { getModuleManifest } from "@rokki/sdk";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * GET  /api/v1/terminals/:id/modules
 *   → list modules installed on this terminal (archived = false).
 *
 * POST /api/v1/terminals/:id/modules { slug, config? }
 *   → install a module on this terminal. RLS gates this to terminal
 *     owners/managers per `MODULE_PLAN.md §5`.
 *
 * Mirror of the space-scoped equivalent — same error envelope, same
 * idempotent-unarchive behavior, same fallthrough to RLS for authz.
 */

async function handleGet(_req: NextRequest, { params }: Props) {
  const { id: terminalId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { data, error } = await supabase
    .from("terminal_modules")
    .select(
      "id, slug, display_order, config, installed_by, installed_at, archived_at, modules_catalog(name, icon, scopes)",
    )
    .eq("terminal_id", terminalId)
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
  const { id: terminalId } = await params;
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

  const manifest = getModuleManifest(slug);
  if (manifest && !manifest.scopes.includes("terminal")) {
    return badRequest(`Module "${slug}" doesn't support terminal scope`);
  }

  const { data: existingRaw } = await supabase
    .from("terminal_modules")
    .select("id, archived_at")
    .eq("terminal_id", terminalId)
    .eq("slug", slug)
    .maybeSingle();
  const existing = existingRaw as
    | { id: string; archived_at: string | null }
    | null;

  if (existing) {
    if (existing.archived_at) {
      const { data, error } = await supabase
        .from("terminal_modules")
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
    .from("terminal_modules")
    .insert({
      terminal_id: terminalId,
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
  if (error.code === "42501") {
    return NextResponse.json(
      {
        errors: [
          {
            code: "forbidden",
            message: "Only terminal owners or managers can install modules",
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

export const GET = withObservability(
  handleGet,
  "GET /api/v1/terminals/[id]/modules",
);
export const POST = withObservability(
  handlePost,
  "POST /api/v1/terminals/[id]/modules",
);
