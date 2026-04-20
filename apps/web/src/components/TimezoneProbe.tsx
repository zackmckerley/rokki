"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { detectClientTimezone } from "@/lib/timezone";

/**
 * Mount once on the dashboard. Reads the browser's IANA timezone and
 * saves it to `profiles.timezone` if the stored value is null or has
 * drifted. Silent on failure — timezones are a quality-of-life enhancement,
 * never a blocker.
 */
export function TimezoneProbe({ currentTimezone }: { currentTimezone: string | null }) {
  useEffect(() => {
    const detected = detectClientTimezone();
    if (!detected || detected === currentTimezone) return;
    const supa = createClient();
    void (async () => {
      const {
        data: { user },
      } = await supa.auth.getUser();
      if (!user) return;
      await supa
        .from("profiles")
        // @ts-expect-error generic update collapses to never
        .update({ timezone: detected })
        .eq("user_id", user.id);
    })();
  }, [currentTimezone]);
  return null;
}
