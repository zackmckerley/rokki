import { redirect } from "next/navigation";
import Link from "next/link";
import { Check, X, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/TopBar";
import { ApprovalsClient } from "./ApprovalsClient";

export const metadata = { title: "Approvals — Rokki" };
export const dynamic = "force-dynamic";

/**
 * Approval inbox + outbox. Defaults to "inbox" (things awaiting your
 * action) if you're an owner/admin of any space; otherwise "mine".
 */
export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect_to=/approvals");

  const { data: admins } = await supabase
    .from("space_members")
    .select("space_id")
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"]);
  const hasInbox =
    ((admins ?? []) as { space_id: string }[]).length > 0;

  const scope = (params.scope as "mine" | "inbox") ?? (hasInbox ? "inbox" : "mine");

  return (
    <div className="flex min-h-screen flex-col bg-bg-0">
      <TopBar>
        <Link href="/" className="text-text-3 hover:text-text-1">
          ← Dashboard
        </Link>
        <span className="text-text-3">·</span>
        <span className="text-text-0">Approvals</span>
      </TopBar>
      <main className="mx-auto w-full max-w-4xl flex-1 p-6">
        <header className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold text-text-0">
              <Clock className="h-5 w-5 text-accent" />
              Approvals
            </h1>
            <p className="mt-1 text-xs text-text-3">
              Tool runs and access requests that need a yes or no. Approve
              with <kbd className="rounded-sm border border-border bg-bg-2 px-1 font-mono text-[10px]">A</kbd>
              , deny with{" "}
              <kbd className="rounded-sm border border-border bg-bg-2 px-1 font-mono text-[10px]">D</kbd>
              .
            </p>
          </div>
          <nav className="flex gap-1 text-xs">
            {hasInbox ? (
              <TabLink href="/approvals?scope=inbox" active={scope === "inbox"}>
                Inbox
              </TabLink>
            ) : null}
            <TabLink href="/approvals?scope=mine" active={scope === "mine"}>
              My requests
            </TabLink>
          </nav>
        </header>
        <ApprovalsClient scope={scope} />
      </main>
    </div>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-sm border px-2.5 py-1 uppercase tracking-wide ${
        active
          ? "border-accent bg-accent-subtle text-text-0"
          : "border-border bg-bg-2 text-text-2 hover:bg-bg-3"
      }`}
    >
      {children}
    </Link>
  );
}

// Re-export icons for client to avoid adding more imports.
export { Check, X };
