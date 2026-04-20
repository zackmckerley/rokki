import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/TopBar";

/**
 * Dedicated notifications page. The top ticker remains the live surface;
 * this is the archive + search + filter view.
 */
export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("notifications")
    .select("id, kind, title, body, url, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  type Row = {
    id: string;
    kind: string;
    title: string;
    body: string | null;
    url: string | null;
    read_at: string | null;
    created_at: string;
  };
  const rows = (data ?? []) as Row[];

  return (
    <div className="flex min-h-screen flex-col bg-bg-0">
      <TopBar>
        <Link href="/" className="text-text-3 hover:text-text-1">
          ← Dashboard
        </Link>
        <span className="text-text-3">·</span>
        <span className="text-text-0">Notifications</span>
      </TopBar>
      <main className="mx-auto w-full max-w-3xl flex-1 p-6">
        <h1 className="mb-4 text-xl font-semibold text-text-0">
          Notifications
        </h1>
        {rows.length === 0 ? (
          <p className="rounded border border-dashed border-border bg-bg-1 p-10 text-center text-sm text-text-3">
            Nothing yet. You&apos;ll see mentions, assignments, and invites here.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded border border-border bg-bg-1">
            {rows.map((n) => (
              <li key={n.id}>
                <Link
                  href={n.url ?? "#"}
                  className={`flex flex-col gap-0.5 px-3 py-2 text-sm hover:bg-bg-2 ${
                    !n.read_at ? "bg-bg-2/40" : ""
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-semibold text-text-0">
                      {n.title}
                    </span>
                    <span className="flex-shrink-0 font-mono text-[10px] text-text-3">
                      {new Date(n.created_at).toLocaleString()}
                    </span>
                  </div>
                  {n.body ? (
                    <span className="truncate text-xs text-text-2">
                      {n.body}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
