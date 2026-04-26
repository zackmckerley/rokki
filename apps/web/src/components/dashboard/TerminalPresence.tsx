"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Live "who else is here" indicator for a terminal — an avatar stack of
 * other users currently viewing the same terminal page.
 *
 * Uses Supabase Realtime presence on `presence:terminal:<id>` keyed by
 * user_id. Self is excluded from the visible stack — you don't need to
 * see yourself. Up to 3 avatars are shown, the rest collapse into a
 * "+N" chip. Hover the stack to see the full name list.
 *
 * Channel lifecycle: track on subscribe, untrack + unsubscribe on
 * unmount or terminalId/userId change. We never reuse the channel name
 * across mounts (suffixed) so a quick re-render doesn't collide with
 * the still-tearing-down previous instance.
 *
 * Sized to fit the 44px TopBar — h-5 (20px) circular initials.
 */

interface TerminalPresenceProps {
  terminalId: string;
  userId: string;
  fullName: string;
}

interface PresentUser {
  user_id: string;
  full_name: string;
}

export function TerminalPresence({
  terminalId,
  userId,
  fullName,
}: TerminalPresenceProps) {
  const [present, setPresent] = useState<PresentUser[]>([]);

  useEffect(() => {
    if (!terminalId || !userId) return;
    const supabase = createClient();
    // Per-mount unique channel name avoids the "cannot add postgres_changes
    // callbacks after subscribe()" trap when React re-mounts in dev.
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const channelName = `presence:terminal:${terminalId}:${suffix}`;

    const channel = supabase.channel(channelName, {
      config: { presence: { key: userId } },
    });

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState() as Record<
        string,
        { user_id?: string; full_name?: string }[]
      >;
      const next: PresentUser[] = [];
      for (const [key, metas] of Object.entries(state)) {
        const meta = metas[0];
        next.push({
          user_id: meta?.user_id ?? key,
          full_name: meta?.full_name ?? "—",
        });
      }
      setPresent(next);
    });

    void channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ user_id: userId, full_name: fullName });
      }
    });

    return () => {
      void channel.untrack();
      void channel.unsubscribe();
      void supabase.removeChannel(channel);
    };
  }, [terminalId, userId, fullName]);

  // Exclude self from the visible stack. The full presence list is still
  // tracked above so the channel reflects accurate state to others.
  const others = useMemo(
    () => present.filter((p) => p.user_id !== userId),
    [present, userId],
  );

  if (others.length === 0) return null;

  const visible = others.slice(0, 3);
  const overflow = others.length - visible.length;
  const tooltip = others.map((p) => p.full_name).join(", ");

  return (
    <div
      className="flex items-center -space-x-1.5"
      role="group"
      aria-label={`${others.length} other ${
        others.length === 1 ? "person" : "people"
      } viewing this terminal`}
      title={tooltip}
    >
      {visible.map((p) => (
        <PresenceAvatar key={p.user_id} name={p.full_name} />
      ))}
      {overflow > 0 ? (
        <span
          className={cn(
            "relative inline-flex h-5 w-5 items-center justify-center rounded-full",
            "border border-bg-1 bg-bg-3 font-mono text-[9px] font-semibold text-text-1",
          )}
          aria-hidden="true"
        >
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}

function PresenceAvatar({ name }: { name: string }) {
  // Same initials math as AccountBlock — split on whitespace, first letter
  // of the first 2 words. Empty / single-name fallbacks both work.
  const initials =
    (name || "?")
      .split(/\s+/)
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";
  return (
    <span
      className={cn(
        "relative inline-flex h-5 w-5 items-center justify-center rounded-full",
        "border border-bg-1 bg-bg-3 text-[9px] font-semibold text-text-0",
      )}
      aria-label={name}
    >
      {initials}
    </span>
  );
}
