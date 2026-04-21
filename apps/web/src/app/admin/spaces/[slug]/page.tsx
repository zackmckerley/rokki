import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@rokki/db";
import { AdminSectionHeader } from "@/components/admin/primitives";
import { AdminSpaceDetail, type AdminSpaceDetailData } from "./AdminSpaceDetail";

export const metadata = { title: "Space — Admin" };
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function AdminSpacePage({ params }: Props) {
  const { slug } = await params;

  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: space } = await admin
    .from("spaces")
    .select(
      "id, slug, name, description, archived_at, created_at, created_by",
    )
    .eq("slug", slug.toLowerCase())
    .maybeSingle();
  if (!space) notFound();
  const s = space as AdminSpaceDetailData["space"];

  const [
    { data: rawMembers },
    { data: rawTerminals },
    { count: fileCount },
    { count: taskCount },
  ] = await Promise.all([
    admin
      .from("space_members")
      .select("user_id, role, joined_at")
      .eq("space_id", s.id)
      .order("joined_at", { ascending: true }),
    admin
      .from("terminals")
      .select("id, ticker, name, status, archived_at, created_at")
      .eq("space_id", s.id)
      .order("created_at", { ascending: false }),
    admin
      .from("files")
      .select("id, terminals!inner(space_id)", {
        count: "exact",
        head: true,
      })
      .eq("terminals.space_id", s.id)
      .is("deleted_at", null),
    admin
      .from("tasks")
      .select("id, terminals!inner(space_id)", {
        count: "exact",
        head: true,
      })
      .eq("terminals.space_id", s.id),
  ]);

  const memberRows = (rawMembers ?? []) as {
    user_id: string;
    role: "owner" | "admin" | "member";
    joined_at: string;
  }[];
  const userIds = memberRows.map((m) => m.user_id);
  const { data: profiles } = userIds.length
    ? await admin
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds)
    : { data: [] };
  const profMap = new Map(
    ((profiles ?? []) as { user_id: string; full_name: string | null }[]).map(
      (p) => [p.user_id, p.full_name],
    ),
  );
  const { data: authList } = await admin.auth.admin.listUsers({
    perPage: 200,
    page: 1,
  });
  const emailMap = new Map(
    (authList?.users ?? []).map((u) => [u.id, u.email ?? ""]),
  );

  const data: AdminSpaceDetailData = {
    space: s,
    members: memberRows.map((m) => ({
      ...m,
      full_name: profMap.get(m.user_id) ?? null,
      email: emailMap.get(m.user_id) ?? "",
    })),
    terminals: (rawTerminals ?? []) as AdminSpaceDetailData["terminals"],
    usage: {
      terminal_count: (rawTerminals ?? []).length,
      member_count: memberRows.length,
      file_count: fileCount ?? 0,
      task_count: taskCount ?? 0,
    },
  };

  return (
    <div className="flex flex-col gap-4">
      <AdminSectionHeader
        title={s.name}
        description={
          <span className="font-mono text-[11px]">
            /{s.slug} · {s.id}
            {s.archived_at ? " · ARCHIVED" : ""}
          </span>
        }
        actions={
          <Link
            href="/admin/spaces"
            className="text-xs text-text-3 hover:text-text-1"
          >
            ← back to spaces
          </Link>
        }
      />
      <AdminSpaceDetail data={data} />
    </div>
  );
}
