import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@rokki/db";
import { AdminSectionHeader } from "@/components/admin/primitives";
import { ConfigEditor } from "./ConfigEditor";

export const metadata = { title: "Legal & branding — Admin" };
export const dynamic = "force-dynamic";

export default async function AdminLegalPage() {
  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const keys = ["legal.privacy", "legal.terms", "branding", "defaults"];
  const { data } = await admin
    .from("platform_config")
    .select("key, value")
    .in("key", keys);
  const byKey = new Map<string, unknown>(
    ((data ?? []) as { key: string; value: unknown }[]).map((r) => [
      r.key,
      r.value,
    ]),
  );

  return (
    <div className="flex flex-col gap-4">
      <AdminSectionHeader
        title="Legal, branding, defaults"
        description="Markdown for /privacy and /terms, plus tenant-wide branding and default user prefs."
      />
      <ConfigEditor
        configKey="legal.privacy"
        label="Privacy policy (markdown)"
        kind="markdown"
        value={(byKey.get("legal.privacy") as string) ?? ""}
      />
      <ConfigEditor
        configKey="legal.terms"
        label="Terms of service (markdown)"
        kind="markdown"
        value={(byKey.get("legal.terms") as string) ?? ""}
      />
      <ConfigEditor
        configKey="branding"
        label="Branding (JSON)"
        kind="json"
        value={byKey.get("branding") ?? {}}
      />
      <ConfigEditor
        configKey="defaults"
        label="Default user preferences (JSON)"
        kind="json"
        value={byKey.get("defaults") ?? {}}
      />
    </div>
  );
}
