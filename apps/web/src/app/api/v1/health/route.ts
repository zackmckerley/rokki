import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  configuredProviders,
  providerAvailability,
  dataClassAvailability,
} from "@/lib/markets/providers";
import { tvAvailable } from "@/lib/markets/tv";

import { withObservability } from "@/lib/observability";

// Read API-key env vars at request time, never a build-time snapshot.
export const dynamic = "force-dynamic";

async function handleGet() {
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
      // Informational only — which market-data feeds are wired (booleans, never
      // key values or market data). Lets a deploy be verified without signing
      // in. NOT part of `status`: missing market keys aren't a system failure.
      markets: {
        providers: providerAvailability(),
        classes: dataClassAvailability(),
        attribution: configuredProviders(),
        tv: tvAvailable(), // YOUTUBE_API_KEY present (Markets TV embed)
      },
    },
    { status: allOk ? 200 : 503 },
  );
}

export const GET = withObservability(
  handleGet,
  "GET /api/v1/health",
);
