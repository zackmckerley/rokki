import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/TopBar";
import { MessagesInbox } from "@/components/messages/MessagesInbox";

export default async function MessagesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex h-[100dvh] flex-col bg-bg-0">
      <TopBar>
        <Link href="/" className="text-text-3 hover:text-text-1">
          ← Dashboard
        </Link>
        <span className="text-text-3">·</span>
        <span className="text-text-0">Messages</span>
      </TopBar>
      <main className="mx-auto flex w-full max-w-6xl flex-1 min-h-0 flex-col p-6">
        <MessagesInbox />
      </main>
    </div>
  );
}
