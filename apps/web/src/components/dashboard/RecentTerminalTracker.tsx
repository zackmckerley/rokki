"use client";

import { useEffect } from "react";
import { pushRecentTerminal } from "@/lib/recent-terminals";

/**
 * Tiny no-render client component mounted at the top of a terminal page.
 * Pushes the current terminal onto the local recently-viewed ring on
 * first paint so the Explorer rail can surface it on the next render.
 *
 * Server components can't write to localStorage, hence the dance.
 */
export function RecentTerminalTracker({
  ticker,
  name,
}: {
  ticker: string;
  name: string;
}) {
  useEffect(() => {
    pushRecentTerminal({ ticker, name });
  }, [ticker, name]);
  return null;
}
