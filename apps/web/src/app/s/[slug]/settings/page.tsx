import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/TopBar";
import { SettingsHistorySection } from "@/components/SettingsHistorySection";
import { SpaceSettingsForm } from "./SpaceSettingsForm";

interface Props {
  params: Promise<{ slug: string }>;
}

type SpaceRole = "owner" | "admin" | "member";

/**
 * Per-space settings — rename, manage members, issue invites.
 *
 * Any space member can view (to see the team). Mutations require
 * owner/admin role (enforced at the API and mirrored in disabled UI).
 */
export default async function SpaceSettingsPage({ params }: Props) {
  const { slug } = await params;
  const lower = slug.toLowerCase();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: space } = await supabase
    .from("spaces")
    .select("id, slug, name, created_at")
    .eq("slug", lower)
    .maybeSingle();
  if (!space) notFound();
  const s = space as {
    id: string;
    slug: string;
    name: string;
    created_at: string;
  };

  const { data: me } = await supabase
    .from("space_members")
    .select("role")
    .eq("space_id", s.id)
    .eq("user_id", user.id)
    .maybeSingle();
  const myRole = (me as { role?: SpaceRole } | null)?.role ?? null;
  if (!myRole) notFound();

  const canManage = myRole === "owner" || myRole === "admin";

  const [{ data: rawMembers }, { data: invites }, { count: terminalCount }] =
    await Promise.all([
      supabase
        .from("space_members")
        .select("user_id, role, joined_at")
        .eq("space_id", s.id)
        .order("joined_at", { ascending: true }),
      supabase
        .from("invites")
        .select("id, email, role, invited_at, expires_at")
        .eq("space_id", s.id)
        .is("accepted_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("invited_at", { ascending: false }),
      supabase
        .from("terminals")
        .select("id", { count: "exact", head: true })
        .eq("space_id", s.id)
        .is("archived_at", null),
    ]);

  const bareMembers =
    (rawMembers ?? []) as {
      user_id: string;
      role: SpaceRole;
      joined_at: string;
    }[];
  const userIds = bareMembers.map((m) => m.user_id);
  const { data: profiles } = userIds.length
    ? await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds)
    : { data: [] };
  const profileMap = new Map(
    ((profiles ?? []) as { user_id: string; full_name: string | null }[]).map(
      (p) => [p.user_id, p],
    ),
  );
  const members = bareMembers.map((m) => ({
    user_id: m.user_id,
    role: m.role,
    joined_at: m.joined_at,
    full_name: profileMap.get(m.user_id)?.full_name ?? null,
    is_you: m.user_id === user.id,
  }));

  return (
    <div className="flex min-h-screen flex-col bg-bg-0">
      <TopBar>
        <Link href="/" className="text-text-3 hover:text-text-1">
          Dashboard
        </Link>
        <span className="text-text-3">/</span>
        <span className="text-text-1">{s.name}</span>
        <span className="text-text-3">·</span>
        <span className="text-text-0">Settings</span>
      </TopBar>
      <main className="mx-auto w-full max-w-3xl flex-1 p-6">
        <header className="mb-6">
          <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wide text-text-3">
            Space · {terminalCount ?? 0} terminal{terminalCount === 1 ? "" : "s"}
          </div>
          <h1 className="text-xl font-semibold text-text-0">{s.name}</h1>
          <p className="mt-1 text-xs text-text-3">
            Rename, manage members, and invite new people. Terminal-level
            membership is managed in each terminal&apos;s settings.
          </p>
        </header>
        <SpaceSettingsForm
          initial={{ slug: s.slug, name: s.name }}
          members={members}
          pendingInvites={
            (invites ?? []) as {
              id: string;
              email: string;
              role: SpaceRole;
              invited_at: string;
              expires_at: string;
            }[]
          }
          canManage={canManage}
          myRole={myRole}
          myUserId={user.id}
        />
        <SettingsHistorySection
          entityType="space"
          entityId={s.id}
          actorNames={Object.fromEntries(
            members
              .filter((m) => m.full_name)
              .map((m) => [m.user_id, m.full_name as string]),
          )}
        />
      </main>
    </div>
  );
}
