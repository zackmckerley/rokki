import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/TopBar";
import { TaskDetail } from "@/components/task-detail/TaskDetail";

interface Props {
  params: Promise<{ ticker: string; seq: string }>;
}

/**
 * Task detail page. Loads the rich bundle server-side so the user lands on
 * a fully rendered view (no flash of skeletons). The client component
 * owns all mutations; a revalidation after each mutation keeps server
 * state truthful.
 */
export default async function TaskDetailPage({ params }: Props) {
  const { ticker, seq: seqStr } = await params;
  const seq = Number(seqStr);
  if (!Number.isInteger(seq)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: termData } = await supabase
    .from("terminals")
    .select("id, ticker, name, space_id")
    .eq("ticker", ticker.toUpperCase())
    .maybeSingle();
  const term = termData as
    | { id: string; ticker: string; name: string; space_id: string }
    | null;
  if (!term) notFound();

  const { data: taskRow } = await supabase
    .from("tasks")
    .select(
      "id, ticker_seq, title, description, status, priority, due_date, labels, created_at, updated_at, completed_at, created_by",
    )
    .eq("terminal_id", term.id)
    .eq("ticker_seq", seq)
    .maybeSingle();
  if (!taskRow) notFound();

  // Members of the terminal (for the assignee picker + mention context).
  const { data: memberRows } = await supabase
    .from("terminal_members")
    .select("user_id, role")
    .eq("terminal_id", term.id);
  type MR = { user_id: string; role: string };
  const memberIds = ((memberRows ?? []) as MR[]).map((m) => m.user_id);
  const { data: profiles } = memberIds.length
    ? await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", memberIds)
    : { data: [] };
  type P = {
    user_id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
  const profileBy = new Map(
    ((profiles ?? []) as P[]).map((p) => [p.user_id, p]),
  );
  const members = ((memberRows ?? []) as MR[]).map((m) => ({
    user_id: m.user_id,
    role: m.role,
    full_name: profileBy.get(m.user_id)?.full_name ?? null,
    avatar_url: profileBy.get(m.user_id)?.avatar_url ?? null,
  }));

  // Other tasks in this terminal for the dependency picker.
  const { data: siblingRows } = await supabase
    .from("tasks")
    .select("id, ticker_seq, title, status")
    .eq("terminal_id", term.id)
    .neq("id", (taskRow as { id: string }).id)
    .limit(200);
  const siblings = (siblingRows ?? []) as {
    id: string;
    ticker_seq: number;
    title: string;
    status: string;
  }[];

  return (
    <div className="flex min-h-screen flex-col bg-bg-0">
      <TopBar>
        <Link href="/" className="text-text-3 hover:text-text-1">
          ← Dashboard
        </Link>
        <span className="text-text-3">·</span>
        <Link
          href={`/p/${term.ticker}`}
          className="text-text-3 hover:text-text-1"
        >
          {term.name}
        </Link>
        <span className="text-text-3">·</span>
        <span className="font-mono text-text-0">
          {term.ticker}-{(taskRow as { ticker_seq: number }).ticker_seq}
        </span>
      </TopBar>
      <main className="mx-auto w-full max-w-5xl flex-1 p-6">
        <TaskDetail
          initialTask={
            taskRow as {
              id: string;
              ticker_seq: number;
              title: string;
              description: string | null;
              status: string;
              priority: number;
              due_date: string | null;
              labels: string[] | null;
              created_at: string;
              updated_at: string;
              completed_at: string | null;
              created_by: string;
            }
          }
          terminal={{ id: term.id, ticker: term.ticker, name: term.name }}
          members={members}
          siblings={siblings}
          currentUserId={user.id}
        />
      </main>
    </div>
  );
}
