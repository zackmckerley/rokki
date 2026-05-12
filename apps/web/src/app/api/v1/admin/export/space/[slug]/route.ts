import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

import { withObservability } from "@/lib/observability";
interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * GET /api/v1/admin/export/space/:slug
 *
 * Full tenant export — every member, terminal, task, file (metadata),
 * comment, and recent activity row scoped to this space. Returned as a
 * JSON bundle with a content-disposition that triggers a download.
 *
 * Suitable for migrations, support archeology, or fulfilling a
 * tenant-side data-portability request.
 */
async function handleGet(request: NextRequest, { params }: Props) {
  const { slug } = await params;
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin } = gate;

  const { data: space } = await admin
    .from("spaces")
    .select("id, slug, name, description, created_at, archived_at")
    .eq("slug", slug.toLowerCase())
    .maybeSingle();
  if (!space)
    return NextResponse.json(
      { errors: [{ code: "not_found", message: "Space not found" }] },
      { status: 404 },
    );
  const s = space as { id: string; slug: string };

  const [{ data: members }, { data: terminals }] = await Promise.all([
    admin
      .from("space_members")
      .select("user_id, role, joined_at")
      .eq("space_id", s.id),
    admin
      .from("terminals")
      .select(
        "id, ticker, name, description, type, status, created_at, archived_at",
      )
      .eq("space_id", s.id),
  ]);

  const terminalIds = ((terminals ?? []) as { id: string }[]).map((t) => t.id);

  const [{ data: tasks }, { data: files }, { data: activity }] =
    await Promise.all([
      terminalIds.length
        ? admin
            .from("tasks")
            .select(
              "id, terminal_id, title, status, priority, due_date, created_at, created_by",
            )
            .in("terminal_id", terminalIds)
            .limit(20_000)
        : { data: [] },
      terminalIds.length
        ? admin
            .from("files")
            .select(
              "id, terminal_id, filename, folder, mime_type, size_bytes, visibility, uploaded_at, uploaded_by",
            )
            .in("terminal_id", terminalIds)
            .is("deleted_at", null)
            .limit(20_000)
        : { data: [] },
      admin
        .from("activity")
        .select(
          "id, action, actor_id, terminal_id, entity_type, entity_id, metadata, created_at",
        )
        .eq("space_id", s.id)
        .order("created_at", { ascending: false })
        .limit(10_000),
    ]);

  const bundle = {
    exported_at: new Date().toISOString(),
    space,
    counts: {
      members: (members ?? []).length,
      terminals: (terminals ?? []).length,
      tasks: (tasks ?? []).length,
      files: (files ?? []).length,
      activity_rows: (activity ?? []).length,
    },
    members: members ?? [],
    terminals: terminals ?? [],
    tasks: tasks ?? [],
    files: files ?? [],
    recent_activity: activity ?? [],
  };

  return new Response(JSON.stringify(bundle, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="rokki-space-${slug}.json"`,
    },
  });
}

export const GET = withObservability<Props>(
  handleGet,
  "GET /api/v1/admin/export/space/:slug",
);
