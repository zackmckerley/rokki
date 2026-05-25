import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/TopBar";
import { TasksCard } from "@/components/dashboard/TasksCard";
import {
  loadAssignedTasks,
  loadDelegatedTasks,
  loadDashTerminals,
} from "@/lib/dashboard-queries";

export default async function MyTasksPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [assigned, delegated, terminals] = await Promise.all([
    loadAssignedTasks(supabase, user.id),
    loadDelegatedTasks(supabase, user.id),
    loadDashTerminals(supabase),
  ]);
  // Values are slugs (URL-friendly), prop name stays for legacy parity.
  const tickerById = Object.fromEntries(terminals.map((t) => [t.id, t.slug]));
  const terminalNameById = Object.fromEntries(
    terminals.map((t) => [t.id, t.name]),
  );

  return (
    <div className="flex min-h-screen flex-col bg-bg-0">
      <TopBar>
        <Link href="/" className="text-text-3 hover:text-text-1">
          ← Dashboard
        </Link>
        <span className="text-text-3">·</span>
        <span className="text-text-0">My tasks</span>
      </TopBar>
      <main className="mx-auto w-full max-w-4xl flex-1 p-6">
        <div className="h-[80vh]">
          <TasksCard
            assigned={assigned}
            delegated={delegated}
            tickerById={tickerById}
            terminalNameById={terminalNameById}
            expanded
          />
        </div>
      </main>
    </div>
  );
}
