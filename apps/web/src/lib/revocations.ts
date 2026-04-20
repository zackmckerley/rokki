type RevocationReason =
  | "terminal_member_removed"
  | "space_member_removed"
  | "token_revoked"
  | "admin_action";

interface RevokeInput {
  userId: string;
  reason: RevocationReason;
  scopeType?: "terminal" | "space" | "token";
  scopeId?: string;
}

/**
 * Fire-and-forget insert into session_revocations. The realtime
 * subscription in `SessionGuard` picks it up and signs the user out
 * within a few seconds.
 *
 * Intentionally does NOT throw on failure — a revocation signal is a
 * best-effort nudge on top of RLS. If the DB write fails, the user
 * hits a 403 on their next request instead of a clean sign-out, which
 * is still correct, just uglier.
 *
 * Takes `unknown` for the client to avoid leaking generic-parameter
 * mismatches between the cookie client and the service-role client.
 */
export async function revokeSessions(
  supabase: unknown,
  input: RevokeInput,
): Promise<void> {
  const payload: Record<string, unknown> = {
    user_id: input.userId,
    reason: input.reason,
  };
  if (input.scopeType) payload.scope_type = input.scopeType;
  if (input.scopeId) payload.scope_id = input.scopeId;

  const client = supabase as {
    from: (table: string) => {
      insert: (row: Record<string, unknown>) => Promise<{
        error: { message: string } | null;
      }>;
    };
  };

  const { error } = await client.from("session_revocations").insert(payload);
  if (error) {
    console.warn(
      `[revokeSessions] failed for ${input.userId}/${input.reason}: ${error.message}`,
    );
  }
}
