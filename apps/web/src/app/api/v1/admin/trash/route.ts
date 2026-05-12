import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

import { withObservability } from "@/lib/observability";
/**
 * GET /api/v1/admin/trash?kind=tasks|terminals|spaces|files|comments|all&limit=200
 *
 * Returns soft-deleted rows from the requested kind, joined with actor
 * names so the table can render "deleted by" without a second round-trip.
 *
 * Service-role read — RLS would hide these rows from the admin's own
 * cookie session because the SELECT policies filter `deleted_at IS NULL`
 * (intentionally — Trash is the only place soft-deleted rows surface).
 */

const VALID_KINDS = new Set([
  "tasks",
  "terminals",
  "spaces",
  "files",
  "comments",
  "all",
] as const);

export interface TrashEntry {
  kind: "tasks" | "terminals" | "spaces" | "files" | "comments";
  id: string;
  label: string;
  /** ISO timestamp of soft-delete. Spaces/terminals use archived_at. */
  deleted_at: string;
  /** user_id of who deleted it, when known. */
  deleted_by: string | null;
  /** Optional context: terminal ticker, space slug, etc. */
  context: string | null;
}

async function handleGet(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin } = gate;

  const url = new URL(request.url);
  const kindParam = url.searchParams.get("kind") ?? "all";
  if (!VALID_KINDS.has(kindParam as never)) {
    return NextResponse.json(
      {
        errors: [
          {
            code: "invalid_request",
            message: `kind must be one of ${[...VALID_KINDS].join(", ")}`,
          },
        ],
      },
      { status: 400 },
    );
  }
  const limitParam = Number(url.searchParams.get("limit") ?? "200");
  const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 200, 1), 1000);

  const wanted = (kind: string) => kindParam === "all" || kindParam === kind;
  const collected: TrashEntry[] = [];

  if (wanted("tasks")) {
    // tasks.deleted_at + deleted_by land in migration
    // 20260427060000_soft_delete_consistency; generated types lag until
    // `supabase gen types` runs. Cast through unknown.
    const { data } = await admin
      .from("tasks")
      .select(
        "id, title, deleted_at, deleted_by, terminals!inner(ticker)",
      )
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false })
      .limit(limit);
    type Row = {
      id: string;
      title: string;
      deleted_at: string;
      deleted_by: string | null;
      terminals: { ticker: string } | null;
    };
    for (const row of ((data ?? []) as unknown) as Row[]) {
      collected.push({
        kind: "tasks",
        id: row.id,
        label: row.title,
        deleted_at: row.deleted_at,
        deleted_by: row.deleted_by,
        context: row.terminals?.ticker ?? null,
      });
    }
  }

  if (wanted("terminals")) {
    const { data } = await admin
      .from("terminals")
      .select("id, ticker, name, archived_at, spaces(slug)")
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false })
      .limit(limit);
    type Row = {
      id: string;
      ticker: string;
      name: string;
      archived_at: string;
      spaces: { slug: string } | null;
    };
    for (const row of (data ?? []) as Row[]) {
      collected.push({
        kind: "terminals",
        id: row.id,
        label: `${row.ticker} · ${row.name}`,
        deleted_at: row.archived_at,
        deleted_by: null,
        context: row.spaces?.slug ?? null,
      });
    }
  }

  if (wanted("spaces")) {
    const { data } = await admin
      .from("spaces")
      .select("id, slug, name, archived_at")
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false })
      .limit(limit);
    type Row = {
      id: string;
      slug: string;
      name: string;
      archived_at: string;
    };
    for (const row of (data ?? []) as Row[]) {
      collected.push({
        kind: "spaces",
        id: row.id,
        label: `${row.slug} · ${row.name}`,
        deleted_at: row.archived_at,
        deleted_by: null,
        context: null,
      });
    }
  }

  if (wanted("files")) {
    const { data } = await admin
      .from("files")
      .select(
        "id, filename, folder, deleted_at, deleted_by, terminals!inner(ticker)",
      )
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false })
      .limit(limit);
    type Row = {
      id: string;
      filename: string;
      folder: string;
      deleted_at: string;
      deleted_by: string | null;
      terminals: { ticker: string } | null;
    };
    for (const row of (data ?? []) as Row[]) {
      collected.push({
        kind: "files",
        id: row.id,
        label: `${row.folder === "/" ? "" : row.folder + "/"}${row.filename}`,
        deleted_at: row.deleted_at,
        deleted_by: row.deleted_by,
        context: row.terminals?.ticker ?? null,
      });
    }
  }

  if (wanted("comments")) {
    const { data } = await admin
      .from("comments")
      .select(
        "id, body, deleted_at, created_by, terminals!inner(ticker)",
      )
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false })
      .limit(limit);
    type Row = {
      id: string;
      body: string;
      deleted_at: string;
      created_by: string | null;
      terminals: { ticker: string } | null;
    };
    for (const row of (data ?? []) as Row[]) {
      collected.push({
        kind: "comments",
        id: row.id,
        label: row.body.length > 80 ? row.body.slice(0, 79) + "…" : row.body,
        deleted_at: row.deleted_at,
        deleted_by: row.created_by,
        context: row.terminals?.ticker ?? null,
      });
    }
  }

  // Hydrate actor names.
  const actorIds = Array.from(
    new Set(collected.map((c) => c.deleted_by).filter(Boolean) as string[]),
  );
  const actorMap = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("user_id, full_name")
      .in("user_id", actorIds);
    for (const row of (profiles ?? []) as { user_id: string; full_name: string | null }[]) {
      if (row.full_name) actorMap.set(row.user_id, row.full_name);
    }
    const { data: users } = await admin.auth.admin.listUsers({
      perPage: Math.max(actorIds.length, 50),
      page: 1,
    });
    for (const u of users?.users ?? []) {
      if (actorIds.includes(u.id) && !actorMap.has(u.id) && u.email) {
        actorMap.set(u.id, u.email);
      }
    }
  }

  // Sort newest first across all kinds and cap at the requested limit.
  collected.sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));
  const sliced = collected.slice(0, limit);

  return NextResponse.json({
    data: sliced.map((entry) => ({
      ...entry,
      deleted_by_name:
        entry.deleted_by ? (actorMap.get(entry.deleted_by) ?? null) : null,
    })),
  });
}

export const GET = withObservability(
  handleGet,
  "GET /api/v1/admin/trash",
);
