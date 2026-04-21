import { createClient as createAdminClient } from "@supabase/supabase-js";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Database } from "@rokki/db";

export const metadata = { title: "Privacy — Rokki" };
export const dynamic = "force-dynamic";

export default async function PrivacyPage() {
  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data } = await admin
    .from("platform_config")
    .select("value")
    .eq("key", "legal.privacy")
    .maybeSingle();
  const md = (data as { value: string } | null)?.value ?? "_Privacy policy not configured._";
  return (
    <main className="mx-auto max-w-2xl px-6 py-10 text-sm text-text-1 prose prose-invert">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
    </main>
  );
}
