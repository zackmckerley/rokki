import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@rokki/db";
import { AdminSectionHeader } from "@/components/admin/primitives";
import { CopyableId } from "@/components/CopyableId";
import { AdminUserDetail, type AdminUserDetailData } from "./AdminUserDetail";

export const metadata = { title: "User — Admin" };
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ userId: string }>;
}

export default async function AdminUserPage({ params }: Props) {
  const { userId } = await params;

  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: authRes } = await admin.auth.admin.getUserById(userId);
  if (!authRes?.user) notFound();

  const [{ data: profile }, { data: spaceMembers }, { data: terminalMembers }, { data: tokens }] =
    await Promise.all([
      admin
        .from("profiles")
        .select(
          "user_id, full_name, avatar_url, timezone, is_platform_admin, created_at",
        )
        .eq("user_id", userId)
        .maybeSingle(),
      admin
        .from("space_members")
        .select("space_id, role, joined_at, spaces(slug, name)")
        .eq("user_id", userId),
      admin
        .from("terminal_members")
        .select(
          "terminal_id, role, added_at, terminals(ticker, name, space_id)",
        )
        .eq("user_id", userId),
      admin
        .from("access_tokens")
        .select(
          "id, name, token_prefix, scopes, created_at, last_used_at, expires_at, revoked_at",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
    ]);

  const detail: AdminUserDetailData = {
    user: {
      id: authRes.user.id,
      email: authRes.user.email ?? "",
      created_at: authRes.user.created_at ?? "",
      last_sign_in_at: authRes.user.last_sign_in_at ?? null,
      email_confirmed_at: authRes.user.email_confirmed_at ?? null,
      banned_until:
        (authRes.user as unknown as { banned_until?: string | null })
          .banned_until ?? null,
    },
    profile:
      (profile as AdminUserDetailData["profile"]) ?? null,
    space_memberships:
      (spaceMembers as AdminUserDetailData["space_memberships"]) ?? [],
    terminal_memberships:
      (terminalMembers as AdminUserDetailData["terminal_memberships"]) ?? [],
    tokens: (tokens as AdminUserDetailData["tokens"]) ?? [],
  };

  return (
    <div className="flex flex-col gap-4">
      <AdminSectionHeader
        title={detail.profile?.full_name ?? detail.user.email}
        description={
          <span className="flex flex-wrap items-center gap-1">
            <CopyableId value={detail.user.email} label="email" />
            <span className="text-text-3">·</span>
            <CopyableId value={detail.user.id} label="user id" />
          </span>
        }
        actions={
          <Link
            href="/admin/users"
            className="text-xs text-text-3 hover:text-text-1"
          >
            ← back to users
          </Link>
        }
      />
      <AdminUserDetail data={detail} />
    </div>
  );
}
