import { redirect } from "next/navigation";
import Link from "next/link";
import { Activity } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/TopBar";

/**
 * Platform-admin-only view of the raw domain event log. Pagination by
 * monotonic `sequence` would be clean; this MVP shows the 200 most
 * recent. The log is append-only.
 */
export default async function EventsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_platform_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  const isAdmin =
    (profile as { is_platform_admin?: boolean } | null)?.is_platform_admin ===
    true;

  const { data: events } = await supabase
    .from("domain_events")
    .select(
      "id, name, actor_id, space_id, terminal_id, entity_type, entity_id, payload, sequence, occurred_at",
    )
    .order("sequence", { ascending: false })
    .limit(200);

  type Row = {
    id: string;
    name: string;
    actor_id: string | null;
    space_id: string | null;
    terminal_id: string | null;
    entity_type: string | null;
    entity_id: string | null;
    payload: Record<string, unknown>;
    sequence: number;
    occurred_at: string;
  };
  const rows = (events ?? []) as Row[];

  return (
    <div className="flex min-h-screen flex-col bg-bg-0">
      <TopBar>
        <Link href="/settings" className="text-text-3 hover:text-text-1">
          ← Settings
        </Link>
        <span className="text-text-3">·</span>
        <span className="text-text-0">Domain events</span>
      </TopBar>
      <main className="mx-auto w-full max-w-5xl flex-1 p-6">
        <h1 className="mb-2 flex items-center gap-2 text-xl font-semibold text-text-0">
          <Activity className="h-5 w-5 text-accent" />
          Domain events
        </h1>
        <p className="mb-4 text-xs text-text-3">
          Append-only log of every state transition. RLS shows only events
          you can see; platform admins see everything.
        </p>
        {!isAdmin && rows.length === 0 ? (
          <p className="rounded border border-dashed border-border bg-bg-1 p-8 text-center text-sm text-text-3">
            You&apos;ll see the events that happened in terminals and spaces you
            can see here.
          </p>
        ) : null}
        {rows.length > 0 ? (
          <div className="overflow-x-auto rounded border border-border bg-bg-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-bg-2 text-left text-text-3">
                  <th className="px-3 py-2 font-mono">#</th>
                  <th className="px-3 py-2 font-mono">time</th>
                  <th className="px-3 py-2 font-mono">name</th>
                  <th className="px-3 py-2 font-mono">entity</th>
                  <th className="px-3 py-2 font-mono">payload</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border/60 align-top text-text-1"
                  >
                    <td className="px-3 py-2 font-mono text-text-3">
                      {r.sequence}
                    </td>
                    <td className="px-3 py-2 font-mono text-text-3">
                      {new Date(r.occurred_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 font-mono text-text-0">
                      {r.name}
                    </td>
                    <td className="px-3 py-2 font-mono text-text-2">
                      {r.entity_type
                        ? `${r.entity_type}:${(r.entity_id ?? "").slice(0, 8)}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <code className="font-mono text-[11px] text-text-2">
                        {JSON.stringify(r.payload).slice(0, 200)}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </main>
    </div>
  );
}
