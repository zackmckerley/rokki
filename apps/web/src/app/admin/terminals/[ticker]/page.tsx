import { notFound } from "next/navigation";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@rokki/db";
import { AdminSectionHeader } from "@/components/admin/primitives";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { AdminTerminalDetail, type AdminTerminalDetailData } from "./AdminTerminalDetail";

export const metadata = { title: "Terminal — Admin" };
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ ticker: string }>;
}

export default async function AdminTerminalPage({ params }: Props) {
  const { ticker } = await params;

  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: terminal } = await admin
    .from("terminals")
    .select(
      "id, ticker, name, description, type, status, archived_at, created_at, space_id, spaces(slug, name)",
    )
    .eq("ticker", ticker.toUpperCase())
    .maybeSingle();
  if (!terminal) notFound();
  const t = terminal as unknown as AdminTerminalDetailData["terminal"];

  const [
    { data: members },
    { count: taskCount },
    { count: completedCount },
    { count: fileCount },
    { data: latestActivity },
  ] = await Promise.all([
    admin
      .from("terminal_members")
      .select("user_id, role, added_at")
      .eq("terminal_id", t.id),
    admin
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("terminal_id", t.id),
    admin
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("terminal_id", t.id)
      .eq("status", "done"),
    admin
      .from("files")
      .select("id", { count: "exact", head: true })
      .eq("terminal_id", t.id)
      .is("deleted_at", null),
    admin
      .from("activity")
      .select("created_at")
      .eq("terminal_id", t.id)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const memberRows =
    (members as { user_id: string; role: string; added_at: string }[]) ?? [];
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

  const data: AdminTerminalDetailData = {
    terminal: t,
    members: memberRows.map((m) => ({
      ...m,
      full_name: profMap.get(m.user_id) ?? null,
      email: emailMap.get(m.user_id) ?? "",
    })),
    stats: {
      task_count: taskCount ?? 0,
      task_completed: completedCount ?? 0,
      file_count: fileCount ?? 0,
      last_activity_at:
        (latestActivity as { created_at: string }[] | null)?.[0]
          ?.created_at ?? null,
    },
  };

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumbs
        items={[
          { label: "Admin", href: "/admin" },
          { label: "Terminals", href: "/admin/terminals" },
          { label: `${t.ticker} · ${t.name}` },
        ]}
      />
      <AdminSectionHeader
        title={t.name}
        description={
          <span className="font-mono text-[11px]">
            {t.ticker} · {t.id} · {t.spaces?.name ?? "(no space)"}
          </span>
        }
      />
      <AdminTerminalDetail data={data} />
    </div>
  );
}
