import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { unauth } from "@/lib/signal/responses";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * DELETE /api/v1/signal/messages/:id — soft-delete a single message from
 * Rokki (sets deleted_at; the thread view filters those out). RLS scopes to
 * the owner. Like thread deletion, this only clears Rokki's copy — it does not
 * delete on Signal or the other participant's device.
 */
async function handleDelete(_req: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { error } = await supabase
    .from("signal_messages")
    // @ts-expect-error generic update collapses to never
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ errors: [{ message: error.message }] }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}

export const DELETE = withObservability(
  handleDelete,
  "DELETE /api/v1/signal/messages/:id",
);
