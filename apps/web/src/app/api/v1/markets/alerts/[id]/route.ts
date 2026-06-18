import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { marketsDb, type MktAlertRow } from "@/lib/markets/db";
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
 * PATCH  /api/v1/markets/alerts/:id — toggle active / change threshold.
 * DELETE /api/v1/markets/alerts/:id — remove.
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
    active?: boolean;
    threshold?: number;
    note?: string | null;
  };
  const patch: Partial<MktAlertRow> = {};
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") return badRequest("active must be boolean");
    patch.active = body.active;
  }
  if (body.threshold !== undefined) {
    if (typeof body.threshold !== "number" || Number.isNaN(body.threshold))
      return badRequest("threshold must be a number");
    patch.threshold = body.threshold;
  }
  if (body.note !== undefined) {
    patch.note = body.note ? body.note.trim().slice(0, 280) : null;
  }
  if (Object.keys(patch).length === 0) return badRequest("no fields to update");

  const { data, error } = await db
    .from("mkt_alerts")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) return internal(error.message);
  if (!data) return notFound("Alert not found");
  return ok({ alert: data });
}

async function handleDelete(_request: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();
  const db = marketsDb(supabase);

  const { error } = await db.from("mkt_alerts").delete().eq("id", id);
  if (error) return internal(error.message);
  return noContent();
}

export const PATCH = withObservability<Props>(
  handlePatch,
  "PATCH /api/v1/markets/alerts/:id",
);
export const DELETE = withObservability<Props>(
  handleDelete,
  "DELETE /api/v1/markets/alerts/:id",
);
