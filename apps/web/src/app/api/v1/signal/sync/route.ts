import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { bridgeSyncContacts } from "@/lib/signal/bridge";
import { unauth, bridgeErrorResponse } from "@/lib/signal/responses";

/**
 * POST /api/v1/signal/sync — refresh the signed-in user's Signal contact +
 * group directory (signal-cli listContacts/listGroups) into signal_contacts.
 * The bridge also runs this on boot; this is the on-demand trigger.
 */

// The bridge calls signal-cli over RPC and writes rows; give it headroom.
export const maxDuration = 40;

async function handlePost() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  try {
    await bridgeSyncContacts(user.id);
    return NextResponse.json({ data: { ok: true } });
  } catch (e) {
    return bridgeErrorResponse(e);
  }
}

export const POST = withObservability(handlePost, "POST /api/v1/signal/sync");
