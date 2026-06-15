import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { bridgeStartLink } from "@/lib/signal/bridge";
import { unauth, bridgeErrorResponse } from "@/lib/signal/responses";

/**
 * POST /api/v1/signal/link — start linking the signed-in user's Signal
 * account as a secondary device. Returns the `sgnl://linkdevice` URI for the
 * client to render as a QR code. The user id is taken from the session, never
 * the request body, so you can only link your own account.
 */

// signal-cli boots a JVM and emits the device-link URI; give it headroom past
// the default serverless timeout.
export const maxDuration = 30;

async function handlePost() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  try {
    const { uri } = await bridgeStartLink(user.id);
    return NextResponse.json({ data: { uri } });
  } catch (e) {
    return bridgeErrorResponse(e);
  }
}

export const POST = withObservability(handlePost, "POST /api/v1/signal/link");
