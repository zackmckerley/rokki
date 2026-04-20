import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@rokki/db";

/**
 * Domain event emitter. Single entry point so every call site gets the
 * same shape and the same service-role client. Emit is best-effort: if the
 * insert fails we log and continue — losing an audit row is better than
 * breaking the primary operation.
 *
 * Usage:
 *   await emitEvent("task.created", {
 *     actor_id: user.id,
 *     terminal_id: task.terminal_id,
 *     entity_type: "task",
 *     entity_id: task.id,
 *     payload: { title: task.title, priority: task.priority },
 *   });
 */

export interface EmitArgs {
  actor_id?: string | null;
  actor_token_id?: string | null;
  space_id?: string | null;
  terminal_id?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  payload?: Record<string, unknown>;
}

let admin: ReturnType<typeof createAdminClient<Database>> | null = null;
function adminClient() {
  if (admin) return admin;
  admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  return admin;
}

export async function emitEvent(
  name: string,
  args: EmitArgs = {},
): Promise<void> {
  try {
    const { error } = await adminClient()
      .from("domain_events")
      // @ts-expect-error generated insert collapses to never
      .insert({
        name,
        actor_id: args.actor_id ?? null,
        actor_token_id: args.actor_token_id ?? null,
        space_id: args.space_id ?? null,
        terminal_id: args.terminal_id ?? null,
        entity_type: args.entity_type ?? null,
        entity_id: args.entity_id ?? null,
        payload: args.payload ?? {},
      });
    if (error) console.error(`[events] ${name} failed:`, error.message);
  } catch (e) {
    console.error(`[events] ${name} errored:`, e);
  }
}
