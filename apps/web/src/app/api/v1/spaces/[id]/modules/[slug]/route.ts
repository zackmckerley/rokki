import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";

interface Props {
  params: Promise<{ id: string; slug: string }>;
}

/**
 * DELETE /api/v1/spaces/:id/modules/:slug
 *   → archive the module (sets `archived_at`). Data tables the module
 *     wrote stay intact. Reinstalling restores configuration.
 *
 * Per locked decision #5 (`MODULE_PLAN.md §8`) and the rollback rules,
 * we never hard-delete. Archive is the only "uninstall" operation.
 */
async function handleDelete(_req: NextRequest, { params }: Props) {
  const { id: spaceId, slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(
      { errors: [{ code: "unauthenticated", message: "Sign in required" }] },
      { status: 401 },
    );

  const { data, error } = await supabase
    .from("space_modules")
    .update({ archived_at: new Date().toISOString() } as never)
    .eq("space_id", spaceId)
    .eq("slug", slug)
    .is("archived_at", null)
    .select()
    .maybeSingle();

  if (error) {
    if (error.code === "42501") {
      return NextResponse.json(
        {
          errors: [
            {
              code: "forbidden",
              message: "Only space owners or admins can archive modules",
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
  if (!data) {
    return NextResponse.json(
      {
        errors: [
          { code: "not_found", message: "Module is not installed on this space" },
        ],
      },
      { status: 404 },
    );
  }
  return NextResponse.json({ data });
}

export const DELETE = withObservability(
  handleDelete,
  "DELETE /api/v1/spaces/[id]/modules/[slug]",
);
