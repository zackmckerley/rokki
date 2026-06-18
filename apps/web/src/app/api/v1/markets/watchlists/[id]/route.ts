import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { marketsDb, type MktWatchlistRow } from "@/lib/markets/db";
import {
  badRequest,
  internal,
  noContent,
  notFound,
  ok,
  unauthorized,
} from "@/lib/markets/api";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * PATCH  /api/v1/markets/watchlists/:id — rename / reorder.
 * DELETE /api/v1/markets/watchlists/:id — delete (cascades symbols). RLS gates.
 */
async function handlePatch(request: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();
  const db = marketsDb(supabase);

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    display_order?: number;
  };
  const patch: Partial<MktWatchlistRow> = {};
  if (body.name !== undefined) {
    const n = body.name.trim();
    if (!n) return badRequest("name cannot be empty");
    if (n.length > 80) return badRequest("name must be ≤ 80 characters");
    patch.name = n;
  }
  if (body.display_order !== undefined) {
    if (!Number.isInteger(body.display_order))
      return badRequest("display_order must be an integer");
    patch.display_order = body.display_order;
  }
  if (Object.keys(patch).length === 0) return badRequest("no fields to update");

  const { data, error } = await db
    .from("mkt_watchlists")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) return internal(error.message);
  if (!data) return notFound("Watchlist not found");
  return ok({ watchlist: data });
}

async function handleDelete(_request: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();
  const db = marketsDb(supabase);

  const { error } = await db.from("mkt_watchlists").delete().eq("id", id);
  if (error) return internal(error.message);
  return noContent();
}

export const PATCH = withObservability<Props>(
  handlePatch,
  "PATCH /api/v1/markets/watchlists/:id",
);
export const DELETE = withObservability<Props>(
  handleDelete,
  "DELETE /api/v1/markets/watchlists/:id",
);
