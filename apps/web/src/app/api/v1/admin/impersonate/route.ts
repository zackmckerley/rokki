import { NextResponse, type NextRequest } from "next/server";
import {
  createServerClient,
  type CookieOptions,
} from "@supabase/ssr";
import type { Database } from "@rokki/db";
import { requireAdmin } from "@/lib/admin-auth";
import { emitEvent } from "@/lib/events";

interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

/**
 * POST /api/v1/admin/impersonate
 *   { target_user_id, justification }
 *
 *   Issues a magic link for the target user, exchanges it for a session
 *   server-side, and sets the cookie on the response. On success, the
 *   admin's browser is now signed in *as* the target user. The original
 *   admin session cookie is overwritten — there's no "switch back" today;
 *   the admin signs in again to resume.
 *
 *   Logs the swap in `impersonation_events`. Justification is required and
 *   audited — this is meant for support, not for fun.
 */
export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;

  const body = (await request.json().catch(() => ({}))) as {
    target_user_id?: string;
    justification?: string;
  };
  const target = body.target_user_id?.trim();
  const reason = (body.justification ?? "").trim();
  if (!target) return bad("target_user_id required");
  if (reason.length < 10)
    return bad("justification must be ≥ 10 characters");
  if (target === actorId) return bad("cannot impersonate yourself");

  // Fetch the target user's email to generate the link.
  const { data: targetUser } = await admin.auth.admin.getUserById(target);
  if (!targetUser?.user?.email)
    return NextResponse.json(
      { errors: [{ code: "not_found", message: "Target user has no email" }] },
      { status: 404 },
    );

  // Generate a magic link, then exchange the token_hash server-side to mint
  // a session into a cookie-bound response.
  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: targetUser.user.email,
  });
  if (link.error || !link.data?.properties)
    return NextResponse.json(
      {
        errors: [
          {
            code: "internal_error",
            message: link.error?.message ?? "could not generate link",
          },
        ],
      },
      { status: 500 },
    );

  const tokenHash = link.data.properties.hashed_token;
  if (!tokenHash)
    return NextResponse.json(
      {
        errors: [
          {
            code: "internal_error",
            message: "Supabase did not return a token hash",
          },
        ],
      },
      { status: 500 },
    );

  // Bind cookies to the response.
  const response = NextResponse.json({ data: { impersonating: target } });
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { error: verifyErr } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "magiclink",
  });
  if (verifyErr) {
    return NextResponse.json(
      {
        errors: [
          {
            code: "internal_error",
            message: `verify failed: ${verifyErr.message}`,
          },
        ],
      },
      { status: 500 },
    );
  }

  // Audit row — ip + user agent for the record.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  await admin.from("impersonation_events").insert({
    admin_user_id: actorId,
    target_user_id: target,
    justification: reason,
    ip_address: ip,
    user_agent: request.headers.get("user-agent") ?? null,
  } as never);

  void emitEvent("admin.impersonation.started", {
    actor_id: actorId,
    entity_type: "user",
    entity_id: target,
    payload: { reason },
  });

  return response;
}

function bad(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "invalid_request", message: msg }] },
    { status: 400 },
  );
}
