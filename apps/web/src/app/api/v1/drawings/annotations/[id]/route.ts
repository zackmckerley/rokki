import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

import { withObservability } from "@/lib/observability";
interface Props {
  params: Promise<{ id: string }>;
}

/**
 * PATCH  /api/v1/drawings/annotations/:id  { body?, resolved?: boolean }
 * DELETE /api/v1/drawings/annotations/:id  (soft delete)
 */
async function handlePatch(request: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const body = (await request.json().catch(() => ({}))) as {
    body?: string;
    resolved?: boolean;
  };
  const patch: Record<string, unknown> = {};
  if (typeof body.body === "string" && body.body.trim()) {
    if (body.body.length > 4000) return bad("body too long");
    patch.body = body.body.trim();
  }
  if (typeof body.resolved === "boolean") {
    patch.resolved_at = body.resolved ? new Date().toISOString() : null;
  }
  if (Object.keys(patch).length === 0) return bad("nothing to update");

  const { error } = await supabase
    .from("drawing_annotations")
    // @ts-expect-error generic update collapses to never
    .update(patch)
    .eq("id", id);
  if (error) return internal(error.message);
  return new NextResponse(null, { status: 204 });
}

async function handleDelete(_req: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { error } = await supabase
    .from("drawing_annotations")
    // @ts-expect-error generic update collapses to never
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return internal(error.message);
  return new NextResponse(null, { status: 204 });
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

export const PATCH = withObservability<Props>(
  handlePatch,
  "PATCH /api/v1/drawings/annotations/:id",
);
export const DELETE = withObservability<Props>(
  handleDelete,
  "DELETE /api/v1/drawings/annotations/:id",
);
