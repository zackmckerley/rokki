import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/TopBar";
import { WeekCard } from "@/components/dashboard/WeekCard";
import { loadWeekItems } from "@/lib/dashboard-queries";

export default async function CalendarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const items = await loadWeekItems(supabase, user.id);

  return (
    <div className="flex min-h-screen flex-col bg-bg-0">
      <TopBar>
        <Link href="/" className="text-text-3 hover:text-text-1">
          ← Dashboard
        </Link>
        <span className="text-text-3">·</span>
        <span className="text-text-0">Calendar</span>
      </TopBar>
      <main className="mx-auto w-full max-w-4xl flex-1 p-6">
        <h1 className="mb-4 text-xl font-semibold text-text-0">This week</h1>
        <p className="mb-4 text-xs text-text-3">
          Tasks with a due date from terminals you can see. External
          calendar sync (Google, Outlook) lands in a later slice.
        </p>
        <div className="h-[70vh]">
          <WeekCard items={items} />
        </div>
      </main>
    </div>
  );
}
