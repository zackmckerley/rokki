import Link from "next/link";
import { TopBar } from "@/components/TopBar";
import { TokensClient } from "./TokensClient";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const metadata = {
  title: "AI tokens · Rokki",
};

export default async function TokensSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar>
        <span className="text-text-3">/</span>
        <Link href="/" className="text-text-1 hover:text-text-0">
          Dashboard
        </Link>
        <span className="text-text-3">/</span>
        <span className="text-text-0 font-medium">AI tokens</span>
      </TopBar>

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-3xl space-y-8">
          <section>
            <h1 className="text-xl font-semibold text-text-0">
              Connect an AI to Rokki
            </h1>
            <p className="mt-1 max-w-xl text-sm text-text-2">
              Generate a token, paste it into Claude, ChatGPT, or any
              MCP-compatible client, and the AI can read and act on your data —
              scoped to what you can see.
            </p>
          </section>

          <TokensClient />
        </div>
      </main>
    </div>
  );
}
