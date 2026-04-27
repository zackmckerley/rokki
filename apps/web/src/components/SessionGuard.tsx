"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traceBreadcrumb } from "@/lib/observability";

/**
 * Realtime session killer. Mounted once at layout root. When a row
 * appears in `session_revocations` for the current user, we call
 * `signOut` and redirect to /login with a short explanation.
 *
 * Trade-offs:
 *   - Uses a Supabase realtime channel per logged-in tab. If we ever
 *     need thousands of simultaneous users on one space we'd pool these;
 *     for now 1:1 is fine.
 *   - If the user is offline at the moment of revocation, they'll stay
 *     signed in until reconnect. RLS still blocks API calls they can't
 *     make, so the worst case is a confused "nothing loads" state
 *     rather than a security hole.
 *   - Doesn't actually invalidate the JWT — Supabase doesn't expose
 *     per-session revocation. We rely on the client cooperating. That's
 *     fine: a malicious user with a stolen cookie isn't our threat
 *     model; the goal is "member X loses UI access promptly when their
 *     membership is pulled".
 */
export function SessionGuard() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    // Only subscribe if we're authenticated. Otherwise we'd open a channel
    // on the login page for no reason.
    supabase.auth.getUser().then(({ data }) => {
      if (!active || !data.user) return;
      const userId = data.user.id;

      // Unique suffix so remounts don't collide with a still-closing
      // channel of the same name — same class of bug as useRealtimeTable.
      const channelName = `session-revocations:${userId}:${Date.now()}`;
      const channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes" as never,
          {
            event: "INSERT",
            schema: "public",
            table: "session_revocations",
            filter: `user_id=eq.${userId}`,
          },
          async (payload: { new: { reason?: string } }) => {
            const reason = payload.new?.reason ?? "admin_action";
            const label = humanReason(reason);
            // Diagnostic: helps us see which revocation triggered an
            // unexpected sign-out (e.g. clicking around admin shouldn't
            // create a revocation row, but if it does, this print shows
            // what reason came over the wire).
            console.warn(
              "[SessionGuard] forced sign-out:",
              { userId, reason, payload: payload.new },
            );
            traceBreadcrumb({
              category: "auth",
              message: "session.revoked",
              level: "warning",
              data: { user_id: userId, reason },
            });
            try {
              await supabase.auth.signOut();
            } catch {}
            // Push a friendly reason the login page can surface.
            router.replace(`/login?error=${encodeURIComponent(label)}`);
            // Defensive refresh in case replace is intercepted by cached
            // RSC state.
            setTimeout(() => window.location.reload(), 250);
          },
        )
        .subscribe((status: string) => {
          traceBreadcrumb({
            category: "realtime",
            message: `session_guard.${status.toLowerCase()}`,
            data: { user_id: userId, status },
            level:
              status === "CHANNEL_ERROR" || status === "TIMED_OUT"
                ? "warning"
                : "info",
          });
        });

      return () => {
        active = false;
        void supabase.removeChannel(channel);
      };
    });

    return () => {
      active = false;
    };
  }, [router]);

  return null;
}

function humanReason(raw: string): string {
  switch (raw) {
    case "terminal_member_removed":
      return "Your access to that terminal was removed. Sign in again.";
    case "space_member_removed":
      return "You were removed from the space. Sign in again.";
    case "token_revoked":
      return "Your access token was revoked. Sign in again.";
    default:
      return "Your session was ended. Sign in again.";
  }
}
