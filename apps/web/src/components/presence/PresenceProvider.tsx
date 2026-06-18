"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Rokki user presence — who currently has Rokki open.
 *
 * One global Supabase Presence channel (`presence:online`): every mounted
 * provider tracks the signed-in user under their own id, and reads the channel
 * state into a Set of online user ids. Presence is EPHEMERAL — Supabase drops a
 * user automatically when their last tab closes — so this reflects live "online
 * now", with no database writes, no migration, and no `last_seen` persistence.
 * (Signal contacts are NOT Rokki users and never appear here; Signal exposes no
 * presence of its own.)
 *
 * Mount once per page tree (the dashboard shell, the Messages inbox). Consumers
 * read presence with `useIsOnline(userId)` / `useOnlineUsers()`, which are safe
 * to call even with no provider mounted (they read as offline).
 */
/** The set of online user ids. Exported so tests can inject presence state
 *  without standing up a live Supabase channel. */
export const OnlineContext = createContext<Set<string>>(new Set());

export function PresenceProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState<Set<string>>(new Set());

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const me = data.user?.id;
      if (!me || cancelled) return;
      channel = supabase.channel("presence:online", {
        config: { presence: { key: me } },
      });
      channel.on("presence", { event: "sync" }, () => {
        if (!channel) return;
        // presenceState() is keyed by our presence key = user id.
        const state = channel.presenceState() as Record<string, unknown[]>;
        setOnline(new Set(Object.keys(state)));
      });
      await channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED" && channel) {
          await channel.track({ user_id: me, at: new Date().toISOString() });
        }
      });
    })();
    return () => {
      cancelled = true;
      if (channel) {
        void channel.unsubscribe();
        void createClient().removeChannel(channel);
      }
    };
  }, []);

  return (
    <OnlineContext.Provider value={online}>{children}</OnlineContext.Provider>
  );
}

/** The set of Rokki user ids currently online (have Rokki open). */
export function useOnlineUsers(): Set<string> {
  return useContext(OnlineContext);
}

/** True iff the given user currently has Rokki open. */
export function useIsOnline(userId?: string | null): boolean {
  const online = useContext(OnlineContext);
  return userId != null && online.has(userId);
}
