import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin-auth";
import { emitEvent } from "@/lib/events";

import { withObservability } from "@/lib/observability";
/**
 * GET  /api/v1/admin/users
 *   ?q=              search by email or full_name
 *   ?filter=         "admins" | "suspended" | "active"
 *   ?limit=          default 50, max 200
 *   ?offset=         default 0
 *
 * POST /api/v1/admin/users
 *   { email, full_name?, timezone?, password?, is_platform_admin?, send_welcome_email? }
 *
 * GET lists users by joining auth.users with profiles. Returns a paginated
 * list with enough shape for the UserPicker, the admin table, and the user
 * detail landing.
 *
 * POST creates via Supabase's auth admin API so the auth.identities row +
 * password hashing are handled correctly. If `is_platform_admin` is true
 * we flip the profile flag after the user is created.
 */
async function handleGet(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin } = gate;

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const filter = url.searchParams.get("filter") ?? "";
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1),
    200,
  );
  const offset = Math.max(
    parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
    0,
  );

  // Supabase listUsers supports pagination but no search — we pull every page
  // and filter/search/paginate in memory. Loop until a short page signals the
  // end (previously this fetched only page 1, so any instance past 200 users
  // silently dropped everyone after #200 from the table + search). The 10k cap
  // is a safety bound far above expected admin volume.
  const all: User[] = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      perPage: 200,
      page,
    });
    if (error) {
      return NextResponse.json(
        { errors: [{ code: "internal_error", message: error.message }] },
        { status: 500 },
      );
    }
    const batch = data?.users ?? [];
    all.push(...batch);
    if (batch.length < 200) break;
  }

  // Join with profiles (admin flag, full_name). Pull the whole small table.
  const { data: profs } = await admin
    .from("profiles")
    .select("user_id, full_name, timezone, is_platform_admin");
  const profileMap = new Map(
    ((profs ?? []) as Array<{
      user_id: string;
      full_name: string | null;
      timezone: string | null;
      is_platform_admin: boolean;
    }>).map((p) => [p.user_id, p]),
  );

  interface Row {
    user_id: string;
    email: string;
    full_name: string | null;
    timezone: string | null;
    is_platform_admin: boolean;
    created_at: string;
    last_sign_in_at: string | null;
    banned_until: string | null;
  }

  const rows: Row[] = all.map((u) => {
    const p = profileMap.get(u.id);
    return {
      user_id: u.id,
      email: u.email ?? "",
      full_name: p?.full_name ?? null,
      timezone: p?.timezone ?? null,
      is_platform_admin: p?.is_platform_admin ?? false,
      created_at: u.created_at ?? "",
      last_sign_in_at: u.last_sign_in_at ?? null,
      banned_until:
        (u as unknown as { banned_until?: string | null }).banned_until ?? null,
    };
  });

  let filtered = rows;
  if (q) {
    const lower = q.toLowerCase();
    filtered = filtered.filter(
      (r) =>
        r.email.toLowerCase().includes(lower) ||
        (r.full_name ?? "").toLowerCase().includes(lower),
    );
  }
  if (filter === "admins") {
    filtered = filtered.filter((r) => r.is_platform_admin);
  } else if (filter === "suspended") {
    filtered = filtered.filter(
      (r) => r.banned_until && new Date(r.banned_until) > new Date(),
    );
  } else if (filter === "active") {
    filtered = filtered.filter(
      (r) => !r.banned_until || new Date(r.banned_until) <= new Date(),
    );
  }

  const total = filtered.length;
  const paged = filtered.slice(offset, offset + limit);

  return NextResponse.json({
    data: paged,
    meta: { total, limit, offset },
  });
}

const EMAIL_RE = /^\S+@\S+\.\S+$/;
const TZ_RE = /^[A-Za-z]+(?:[_+\-][A-Za-z0-9]+)*(?:\/[A-Za-z]+(?:[_+\-][A-Za-z0-9]+)*)*$/;

async function handlePost(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;

  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    full_name?: string;
    timezone?: string;
    password?: string;
    is_platform_admin?: boolean;
    send_welcome_email?: boolean;
  };

  const email = body.email?.trim().toLowerCase() ?? "";
  if (!email || !EMAIL_RE.test(email)) return bad("valid email required");
  if (body.full_name && body.full_name.length > 120)
    return bad("full_name must be ≤ 120 chars");
  if (body.timezone && (body.timezone.length > 60 || !TZ_RE.test(body.timezone)))
    return bad("timezone must look like IANA (e.g. America/New_York)");
  if (body.password && body.password.length < 8)
    return bad("password must be ≥ 8 chars");

  // Either a set password OR an invite email; if neither provided we still
  // create the user with an auto-generated password + a magic link so they
  // can log in.
  const sendEmail = body.send_welcome_email ?? !body.password;
  const initialPassword =
    body.password ?? crypto.randomUUID() + crypto.randomUUID();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: initialPassword,
    email_confirm: true,
    user_metadata: {
      full_name: body.full_name ?? undefined,
    },
  });
  if (createErr || !created?.user) {
    if ((createErr?.message ?? "").toLowerCase().includes("already")) {
      return conflict("a user with that email already exists");
    }
    return internal(createErr?.message ?? "createUser failed");
  }
  const newUserId = created.user.id;

  // The public.profiles row is created by a trigger on auth.users insert.
  // We PATCH it with the fields we want (upsert for idempotency).
  await admin
    .from("profiles")
    .upsert(
      {
        user_id: newUserId,
        full_name: body.full_name ?? null,
        timezone: body.timezone ?? null,
        is_platform_admin: body.is_platform_admin ?? false,
      } as never,
      { onConflict: "user_id" },
    );

  // Fire a welcome magic link if asked. On failure we swallow — the user
  // still exists and can use password reset.
  if (sendEmail) {
    try {
      await admin.auth.admin.generateLink({
        type: "invite",
        email,
        options: {
          redirectTo: `${
            process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
          }/auth/callback`,
        },
      });
    } catch {
      // Best-effort; if generateLink fails we still return 201.
    }
  }

  void emitEvent("admin.user.created", {
    actor_id: actorId,
    entity_type: "user",
    entity_id: newUserId,
    payload: {
      email,
      full_name: body.full_name ?? null,
      is_platform_admin: body.is_platform_admin ?? false,
      welcome_email_sent: sendEmail,
    },
  });

  return NextResponse.json(
    {
      data: {
        user_id: newUserId,
        email,
        is_platform_admin: body.is_platform_admin ?? false,
      },
    },
    { status: 201 },
  );
}

function bad(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "invalid_request", message: msg }] },
    { status: 400 },
  );
}
function conflict(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "conflict", message: msg }] },
    { status: 409 },
  );
}
function internal(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "internal_error", message: msg }] },
    { status: 500 },
  );
}

export const GET = withObservability(
  handleGet,
  "GET /api/v1/admin/users",
);
export const POST = withObservability(
  handlePost,
  "POST /api/v1/admin/users",
);
