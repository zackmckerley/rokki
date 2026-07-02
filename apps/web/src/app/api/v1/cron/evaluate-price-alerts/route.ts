import { NextResponse, type NextRequest } from "next/server";
import { withObservability } from "@/lib/observability";
import { evaluatePriceAlerts } from "@/lib/markets/evaluate-alerts";
import { verifyCronSecret } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST/GET /api/v1/cron/evaluate-price-alerts — evaluate active price alerts
 * and fire notifications. Authenticated by CRON_SECRET (x-cron-secret header
 * or Bearer token), matching the other cron routes. Scheduled via GitHub
 * Actions (see docs/09_ENVIRONMENTS.md / cron workflows).
 */
function authorize(request: NextRequest): boolean {
  return verifyCronSecret(request);
}

function unauthorized(): NextResponse {
  return NextResponse.json(
    {
      errors: [
        {
          code: "unauthorized",
          message: "Cron endpoint requires `x-cron-secret` or Bearer token",
        },
      ],
    },
    { status: 401 },
  );
}

async function handle(request: NextRequest) {
  if (!authorize(request)) return unauthorized();
  const result = await evaluatePriceAlerts();
  return NextResponse.json({ data: result });
}

export const POST = withObservability(
  handle,
  "POST /api/v1/cron/evaluate-price-alerts",
);
export const GET = withObservability(
  handle,
  "GET /api/v1/cron/evaluate-price-alerts",
);
