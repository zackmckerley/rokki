import { NextResponse, type NextRequest } from "next/server";
import { withObservability } from "@/lib/observability";

/**
 * POST /api/v1/auth/send-link
 *
 * Disabled. Rokki is a closed system — accounts are provisioned by
 * platform admins only. Magic-link self-service was removed; password
 * login (POST /api/v1/auth/password-login) is the only authentication
 * path for end users.
 *
 * Returning 410 Gone (rather than 404) so any old client code that
 * still calls this endpoint sees a clear "this is intentionally
 * removed" signal instead of a generic not-found.
 */
async function handler(_request: NextRequest) {
  return NextResponse.json(
    {
      errors: [
        {
          code: "endpoint_removed",
          message:
            "Magic-link sign-in has been disabled. Contact your administrator for an account.",
        },
      ],
    },
    { status: 410 },
  );
}

export const POST = withObservability(handler, "POST /api/v1/auth/send-link");
