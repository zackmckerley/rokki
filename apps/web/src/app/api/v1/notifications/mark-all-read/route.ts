import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

import { withObservability } from "@/lib/observability";
/**
 * PATCH /api/v1/notifications/mark-all-read
 * Sets read_at = now() for every unread notification belonging to the
 * current user. RLS already restricts SELECT/UPDATE to the user's own
 * rows, so the WHERE just needs `read_at IS NULL`.
 *
 * Returns 204 on success. Single-shot, idempotent — repeated calls are
 * cheap (a no-op once everything is read).
 */
async function handlePatch() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { errors: [{ code: "unauthenticated", message: "Sign in required" }] },
      { status: 401 },
    );
  }

  const { error } = await supabase
    .from("notifications")
    // @ts-expect-error generic update payload collapses to never
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);

  if (error) {
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: error.message }] },
      { status: 500 },
    );
  }

  return new NextResponse(null, { status: 204 });
}

export const PATCH = withObservability(
  handlePatch,
  "PATCH /api/v1/notifications/mark-all-read",
);
