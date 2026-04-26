import { type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { toCsv } from "@/lib/csv";
import { redactPII } from "@/lib/pii-redact";

/**
 * GET /api/v1/admin/export/audit?since_days=30&include_pii=false
 *
 * CSV export combining `activity` and `domain_events` for compliance.
 * Caps at 50,000 rows so we don't accidentally OOM on a large tenant —
 * narrow the window if you hit the cap.
 *
 * The `metadata` / `payload` JSON columns regularly carry user emails
 * and IPs (login attempts, magic-link sends, invite events). By
 * default we run every row through `redactPII` so the resulting CSV
 * is safe to share with non-admin reviewers. Pass `?include_pii=true`
 * to bypass the redactor for legitimate admin exports — it's logged
 * in the response filename so the recipient can tell which version
 * they're holding.
 */
export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin } = gate;

  const url = new URL(request.url);
  const days = Math.max(
    1,
    parseInt(url.searchParams.get("since_days") ?? "30", 10),
  );
  const includePII = url.searchParams.get("include_pii") === "true";
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const sanitize = (v: unknown): unknown => (includePII ? v : redactPII(v));

  const [{ data: events }, { data: activity }, { data: revocations }] =
    await Promise.all([
      admin
        .from("domain_events")
        .select(
          "occurred_at, name, actor_id, space_id, terminal_id, entity_type, entity_id, payload",
        )
        .gte("occurred_at", since)
        .order("occurred_at", { ascending: true })
        .limit(25_000),
      admin
        .from("activity")
        .select(
          "created_at, action, actor_id, space_id, terminal_id, entity_type, entity_id, metadata",
        )
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(25_000),
      admin
        .from("session_revocations")
        .select("created_at, user_id, reason, scope_type, scope_id"),
    ]);

  const rows: Array<
    Array<string | number | null | undefined>
  > = [];
  for (const e of (events ?? []) as Array<{
    occurred_at: string;
    name: string;
    actor_id: string | null;
    space_id: string | null;
    terminal_id: string | null;
    entity_type: string | null;
    entity_id: string | null;
    payload: Record<string, unknown>;
  }>) {
    rows.push([
      e.occurred_at,
      "domain_event",
      e.name,
      e.actor_id,
      e.space_id,
      e.terminal_id,
      e.entity_type,
      e.entity_id,
      JSON.stringify(sanitize(e.payload ?? {})),
    ]);
  }
  for (const a of (activity ?? []) as Array<{
    created_at: string;
    action: string;
    actor_id: string | null;
    space_id: string | null;
    terminal_id: string | null;
    entity_type: string | null;
    entity_id: string | null;
    metadata: Record<string, unknown>;
  }>) {
    rows.push([
      a.created_at,
      "activity",
      a.action,
      a.actor_id,
      a.space_id,
      a.terminal_id,
      a.entity_type,
      a.entity_id,
      JSON.stringify(sanitize(a.metadata ?? {})),
    ]);
  }
  for (const r of (revocations ?? []) as Array<{
    created_at: string;
    user_id: string;
    reason: string;
    scope_type: string | null;
    scope_id: string | null;
  }>) {
    rows.push([
      r.created_at,
      "revocation",
      r.reason,
      r.user_id,
      null,
      null,
      r.scope_type,
      r.scope_id,
      "",
    ]);
  }
  rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));

  const csv = toCsv(
    [
      "timestamp",
      "kind",
      "name",
      "actor_id",
      "space_id",
      "terminal_id",
      "entity_type",
      "entity_id",
      "payload",
    ],
    rows,
  );

  const piiTag = includePII ? "raw" : "redacted";
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rokki-audit-${days}d-${piiTag}.csv"`,
    },
  });
}
