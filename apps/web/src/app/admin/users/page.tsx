import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@rokki/db";
import { AdminUsersTable, type AdminUserRow } from "./AdminUsersTable";

export const metadata = { title: "Users — Admin" };
export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Get the full auth user list with service-role. listUsers paginates
  // automatically; for now we list the first 100. Real deployments with
  // more should add a search box (future).
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 100 });
  const authRows = users?.users ?? [];

  const { data: profiles } = await admin
    .from("profiles")
    .select("user_id, full_name, is_platform_admin, timezone");

  const profileMap = new Map(
    ((profiles ?? []) as Array<{
      user_id: string;
      full_name: string | null;
      is_platform_admin: boolean;
      timezone: string | null;
    }>).map((p) => [p.user_id, p]),
  );

  const rows: AdminUserRow[] = authRows.map((u) => {
    const p = profileMap.get(u.id);
    return {
      user_id: u.id,
      email: u.email ?? "",
      full_name: p?.full_name ?? null,
      timezone: p?.timezone ?? null,
      is_platform_admin: p?.is_platform_admin ?? false,
      created_at: u.created_at ?? "",
      last_sign_in_at: u.last_sign_in_at ?? null,
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold text-text-0">Users</h1>
        <p className="mt-1 text-xs text-text-3">
          {rows.length} account{rows.length === 1 ? "" : "s"}. Promote to
          platform admin or force sign-out from here.
        </p>
      </header>
      <AdminUsersTable initial={rows} />
    </div>
  );
}
