import { NextResponse, type NextRequest } from "next/server";
import {
  createServerClient,
  type CookieOptions,
} from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import type { Database, OrgRole, ProjectRole } from "@rokki/db";

type ServerClient = ReturnType<typeof createServerClient<Database>>;

interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

const VALID_OTP_TYPES: EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

function isOtpType(v: string): v is EmailOtpType {
  return (VALID_OTP_TYPES as string[]).includes(v);
}

/**
 * Magic link callback.
 * §04.1 AUTH_SECURITY — exchange OTP token → session; auto-accept any
 * pending invites; redirect to target.
 *
 * Cookies are bound to the outgoing NextResponse explicitly so the session
 * survives the redirect (see https://supabase.com/docs/guides/auth/server-side/nextjs).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const rawType = searchParams.get("type");
  const redirectTo = searchParams.get("redirect_to") ?? "/";

  // Build the response up-front so the Supabase client can bind cookies to it.
  const response = NextResponse.redirect(`${origin}${redirectTo}`);

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value, options }: CookieToSet) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(error.message)}`,
      );
    }
  } else if (tokenHash && rawType && isOtpType(rawType)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: rawType,
    });
    if (error) {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(error.message)}`,
      );
    }
  } else {
    // No server-readable token — the link is using Supabase's implicit flow,
    // where the session lives in the URL hash fragment (#access_token=…).
    // Return an HTML shim that reads the hash client-side, establishes the
    // session, accepts pending invites, then redirects.
    return new NextResponse(hashFragmentHandler(redirectTo), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user?.email) {
    await acceptPendingInvites(supabase, user.id, user.email);
  }

  return response;
}

interface InviteRow {
  id: string;
  email: string;
  space_id: string | null;
  terminal_id: string | null;
  role: string;
  invited_by: string;
}

async function acceptPendingInvites(
  supabase: ServerClient,
  userId: string,
  email: string,
) {
  const { data } = await supabase
    .from("invites")
    .select("id, email, space_id, terminal_id, role, invited_by")
    .eq("email", email)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString());

  const invites = (data ?? []) as InviteRow[];
  if (invites.length === 0) return;

  // Phase 0: generic inference collapses insert types to `never` via this
  // loose cast. Phase 1 will regenerate types precisely and remove the cast.
  const db = supabase as unknown as {
    from: (table: string) => {
      insert: (row: Record<string, unknown>) => Promise<unknown>;
      update: (row: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<unknown>;
      };
    };
  };

  for (const invite of invites) {
    if (invite.space_id) {
      await db.from("space_members").insert({
        space_id: invite.space_id,
        user_id: userId,
        role: invite.role as OrgRole,
      });
    }
    if (invite.terminal_id) {
      await db.from("terminal_members").insert({
        terminal_id: invite.terminal_id,
        user_id: userId,
        role: invite.role as ProjectRole,
        added_by: invite.invited_by,
      });
    }
    await db
      .from("invites")
      .update({ accepted_at: new Date().toISOString(), accepted_by: userId })
      .eq("id", invite.id);
  }
}

/**
 * Tiny HTML doc served when the invite/magic-link flow used implicit auth.
 * Reads access_token + refresh_token from the URL hash, calls setSession on
 * a Supabase client, then redirects to the target path so the normal
 * auth-callback → accept-invite logic runs as if it were a PKCE flow.
 */
function hashFragmentHandler(redirectTo: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const safeRedirect = redirectTo.replace(/"/g, "");

  return `<!DOCTYPE html><html><head><title>Signing you in…</title>
<meta name="robots" content="noindex, nofollow" />
<style>
  html,body{background:#0A0A0B;color:#C8C8CD;font-family:system-ui,-apple-system,sans-serif;margin:0;height:100%}
  .wrap{display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;gap:12px}
  .spinner{width:16px;height:16px;border:2px solid #3A3A42;border-top-color:#F5A623;border-radius:50%;animation:spin 0.8s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
</style></head><body>
<div class="wrap"><div class="spinner"></div><div>Signing you in…</div></div>
<script type="module">
  import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
  const hash = window.location.hash.slice(1);
  const params = new URLSearchParams(hash);
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  const err = params.get("error_description") || params.get("error");
  if (err) { window.location.replace("/login?error=" + encodeURIComponent(err)); }
  else if (!access_token || !refresh_token) { window.location.replace("/login?error=missing_tokens"); }
  else {
    const supabase = createClient("${supabaseUrl}", "${supabaseAnon}");
    try {
      const { error } = await supabase.auth.setSession({ access_token, refresh_token });
      if (error) { window.location.replace("/login?error=" + encodeURIComponent(error.message)); }
      else {
        // Hit /auth/callback once more so the server-side accept-invite logic runs
        // now that the session cookie is set.
        window.location.replace("/auth/callback/finalize?redirect_to=${encodeURIComponent(safeRedirect)}");
      }
    } catch (e) {
      window.location.replace("/login?error=" + encodeURIComponent(String(e)));
    }
  }
</script>
</body></html>`;
}
