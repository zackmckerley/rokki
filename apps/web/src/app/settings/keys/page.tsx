import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/TopBar";
import { ApiKeysClient, type StoredKey } from "./ApiKeysClient";

export const metadata = { title: "API keys — Rokki" };
export const dynamic = "force-dynamic";

/**
 * Bring-your-own-key management. Stored keys are AES-256-GCM encrypted
 * with the server's master key; only metadata (provider + key_hint) is
 * exposed back to the UI after insert.
 */
export default async function ApiKeysPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect_to=/settings/keys");

  const { data } = await supabase
    .from("api_keys")
    .select("id, provider, key_hint, last_used_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="flex min-h-screen flex-col bg-bg-0">
      <TopBar>
        <Link href="/settings" className="text-text-3 hover:text-text-1">
          ← Settings
        </Link>
        <span className="text-text-3">·</span>
        <span className="text-text-0">API keys</span>
      </TopBar>
      <main className="mx-auto w-full max-w-2xl flex-1 p-6">
        <h1 className="mb-1 text-xl font-semibold text-text-0">API keys</h1>
        <p className="mb-6 text-xs text-text-3">
          Your own provider keys (OpenAI, Anthropic, etc.) used by tools that
          require them. Encrypted at rest; the plaintext is never stored or
          displayed after entry.
        </p>
        <ApiKeysClient initial={(data ?? []) as StoredKey[]} />
      </main>
    </div>
  );
}
