import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const checks: Record<string, { ok: boolean; error?: string }> = {};

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("spaces").select("id").limit(1);
    checks.database = { ok: !error, error: error?.message };
  } catch (err) {
    checks.database = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const allOk = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    {
      status: allOk ? "ok" : "degraded",
      version: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
      time: new Date().toISOString(),
      checks,
    },
    { status: allOk ? 200 : 503 },
  );
}
