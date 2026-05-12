import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

import { withObservability } from "@/lib/observability";
interface Props {
  params: Promise<{ id: string }>;
}

/**
 * DELETE /api/v1/calendar/connections/:id
 * Soft-delete (sets revoked_at). We keep the row + cached events so the
 * user can see what we used to sync, then a background job can hard-delete
 * after 30 days.
 */
async function handleDelete(_req: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(
      { errors: [{ code: "unauthenticated", message: "Sign in required" }] },
      { status: 401 },
    );

  const { error } = await supabase
    .from("calendar_connections")
    // @ts-expect-error generic update collapses to never
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error)
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: error.message }] },
      { status: 500 },
    );
  return new NextResponse(null, { status: 204 });
}

export const DELETE = withObservability<Props>(
  handleDelete,
  "DELETE /api/v1/calendar/connections/:id",
);
