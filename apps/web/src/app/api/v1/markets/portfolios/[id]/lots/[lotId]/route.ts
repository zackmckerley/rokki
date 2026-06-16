import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { marketsDb } from "@/lib/markets/db";
import { internal, noContent, unauthorized } from "@/lib/markets/api";

interface Props {
  params: Promise<{ id: string; lotId: string }>;
}

/** DELETE /api/v1/markets/portfolios/:id/lots/:lotId — remove a lot. */
async function handleDelete(_request: NextRequest, { params }: Props) {
  const { id, lotId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();
  const db = marketsDb(supabase);

  const { error } = await db
    .from("mkt_lots")
    .delete()
    .eq("id", lotId)
    .eq("portfolio_id", id);
  if (error) return internal(error.message);
  return noContent();
}

export const DELETE = withObservability<Props>(
  handleDelete,
  "DELETE /api/v1/markets/portfolios/:id/lots/:lotId",
);
