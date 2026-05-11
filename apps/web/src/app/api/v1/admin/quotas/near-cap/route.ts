import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

import { withObservability } from "@/lib/observability";
/**
 * GET /api/v1/admin/quotas/near-cap
 *   ?threshold=  default 0.9 (90% used). Returns rows where
 *                used_credits / limit_credits >= threshold.
 *
 * Used by the admin Quotas page to show who's about to be blocked,
 * before they file a support ticket.
 */
async function handleGet(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin } = gate;

  const url = new URL(request.url);
  const threshold = Math.max(
    0,
    Math.min(parseFloat(url.searchParams.get("threshold") ?? "0.9"), 1),
  );

  // Pull every quota and filter in app code — quotas table is small
  // (one row per (subject, tool, period)) and we already need to
  // hydrate tool + subject info for display.
  const { data: quotas, error } = await admin
    .from("quotas")
    .select(
      "id, subject_type, subject_id, tool_id, period, limit_credits, used_credits, reset_at",
    )
    .gt("limit_credits", 0)
    .order("used_credits", { ascending: false })
    .limit(500);

  if (error)
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: error.message }] },
      { status: 500 },
    );

  type Q = {
    id: string;
    subject_type: string;
    subject_id: string;
    tool_id: string | null;
    period: string;
    limit_credits: number;
    used_credits: number;
    reset_at: string;
  };

  const filtered = ((quotas ?? []) as Q[])
    .map((q) => ({
      ...q,
      pct: q.used_credits / q.limit_credits,
    }))
    .filter((q) => q.pct >= threshold);

  // Hydrate tool + user emails.
  const toolIds = Array.from(
    new Set(filtered.map((q) => q.tool_id).filter(Boolean) as string[]),
  );
  const userIds = Array.from(
    new Set(
      filtered
        .filter((q) => q.subject_type === "user")
        .map((q) => q.subject_id),
    ),
  );
  const [{ data: tools }, { data: authList }] = await Promise.all([
    toolIds.length
      ? admin.from("tools").select("id, slug, name").in("id", toolIds)
      : { data: [] },
    userIds.length
      ? admin.auth.admin.listUsers({ perPage: 200, page: 1 })
      : { data: { users: [] } },
  ]);
  const toolMap = new Map(
    ((tools ?? []) as { id: string; slug: string; name: string }[]).map(
      (t) => [t.id, t],
    ),
  );
  const userEmail = new Map(
    (authList?.users ?? []).map((u) => [u.id, u.email ?? ""]),
  );

  return NextResponse.json({
    data: filtered.map((q) => ({
      ...q,
      tool: q.tool_id ? toolMap.get(q.tool_id) ?? null : null,
      subject_email:
        q.subject_type === "user" ? userEmail.get(q.subject_id) ?? null : null,
    })),
    meta: { threshold },
  });
}

export const GET = withObservability(
  handleGet,
  "GET /api/v1/admin/quotas/near-cap",
);
