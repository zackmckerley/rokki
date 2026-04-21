import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/me/announcements/:id/dismiss
 *   Marks the announcement dismissed for the current user.
 */
export async function POST(_request: NextRequest, { params }: Props) {
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

  await supabase
    .from("announcement_dismissals")
    .upsert(
      { announcement_id: id, user_id: user.id } as never,
      { onConflict: "announcement_id,user_id" },
    );

  return NextResponse.json({ data: { dismissed: true } });
}
