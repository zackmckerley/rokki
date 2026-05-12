import { NextResponse, type NextRequest } from "next/server";
import {
  parseRing,
  publicRing,
  RING_COOKIE,
} from "@/lib/account-ring";
import { createClient } from "@/lib/supabase/server";

import { withObservability } from "@/lib/observability";
/**
 * GET /api/v1/auth/accounts
 *   Returns the public view of the account ring + which one is currently
 *   active (matched against the Supabase session). Used by the
 *   AccountSwitcher dropdown.
 */
async function handleGet(request: NextRequest) {
  const ring = parseRing(request.cookies.get(RING_COOKIE)?.value);

  let activeUserId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    activeUserId = user?.id ?? null;
  } catch {
    // ignore — session unreadable means no active
  }

  return NextResponse.json({
    data: {
      accounts: publicRing(ring),
      active_user_id: activeUserId,
    },
  });
}

export const GET = withObservability(
  handleGet,
  "GET /api/v1/auth/accounts",
);
