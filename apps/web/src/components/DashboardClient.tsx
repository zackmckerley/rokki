"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CreateOrgDialog } from "./CreateOrgDialog";
import { CreateProjectDialog } from "./CreateProjectDialog";
import { DashboardShell } from "./dashboard/DashboardShell";
import { ExplorerRail } from "./dashboard/ExplorerRail";
import { WeekCard } from "./dashboard/WeekCard";
import { TasksCard } from "./dashboard/TasksCard";
import { MessagesCard } from "./dashboard/MessagesCard";
import { TopBar } from "./TopBar";
import { TickerTape } from "./TickerTape";
import { DensityProvider, type Density } from "@/lib/density";
import { TimezoneProbe } from "./TimezoneProbe";
import { BriefingCard } from "./dashboard/BriefingCard";
import type {
  DashSpace,
  DashTerminal,
  AssignedTask,
  DelegatedTask,
  WeekItem,
} from "@/lib/dashboard-queries";

interface DashboardClientProps {
  spaces: DashSpace[];
  terminals: DashTerminal[];
  assigned: AssignedTask[];
  delegated: DelegatedTask[];
  weekItems: WeekItem[];
  tickerItems: { id: string; text: string; when: string }[];
  toolCount: number;
  userName: string;
  userEmail: string;
  isPlatformAdmin: boolean;
  initialDensity: Density;
  savedTimezone: string | null;
  briefingDismissedOn: string | null;
}

/**
 * The dashboard composition root. Owns the layout shell and the two
 * creation dialogs. Server data comes in via props; interactive pieces
 * (ticker, cards) manage their own realtime subscriptions.
 */
export function DashboardClient({
  spaces,
  terminals,
  assigned,
  delegated,
  weekItems,
  tickerItems,
  toolCount,
  userName,
  userEmail,
  isPlatformAdmin,
  initialDensity,
  savedTimezone,
  briefingDismissedOn,
}: DashboardClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [spaceDialog, setSpaceDialog] = useState(false);
  const [terminalDialog, setTerminalDialog] = useState(false);
  const [preferredSpaceSlug, setPreferredSpaceSlug] = useState<string | null>(
    null,
  );

  // Respect ?new=space / ?new=terminal&space=<slug> from the palette or
  // explorer.
  useEffect(() => {
    const want = searchParams.get("new");
    const spaceHint = searchParams.get("space");
    if (want === "space" && isPlatformAdmin) setSpaceDialog(true);
    if (want === "terminal" && spaces.length > 0) {
      setPreferredSpaceSlug(spaceHint);
      setTerminalDialog(true);
    }
    if (want) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("new");
      params.delete("space");
      router.replace(`/${params.size ? `?${params.toString()}` : ""}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const tickerById: Record<string, string> = {};
  const terminalNameById: Record<string, string> = {};
  for (const t of terminals) {
    tickerById[t.id] = t.ticker;
    terminalNameById[t.id] = t.name;
  }

  return (
    <DensityProvider initial={initialDensity}>
      <DashboardShell
        topBar={
          <TopBar>
            <span className="text-text-3">/</span>
            {/* suppressHydrationWarning: greeting() reads new Date().getHours()
                which uses the runtime's local timezone — UTC on Vercel's
                Node server, local on the user's browser. SSR and client
                disagree any time the local hour and UTC hour fall in
                different greeting buckets (e.g. server says "evening" at
                21 UTC, client says "afternoon" at 17 EDT). The mismatch
                triggered React #418, which detaches all event handlers in
                the subtree — symptom: every Link in the dashboard
                silently no-op'd. The greeting is cosmetic; let the client
                win after hydration. */}
            <span className="text-text-1" suppressHydrationWarning>
              {greeting(userName)}
            </span>
            {/* Subtle Cmd+K hint — replaces nothing, just adds a
                discoverable shortcut for power users. The palette
                itself is wired up in <CommandPalette> and triggered
                by the global keydown handler. */}
            <span className="ml-auto hidden items-center gap-1 text-[10px] text-text-3 sm:flex">
              <kbd className="rounded-sm border border-border bg-bg-2 px-1 font-mono text-text-2">
                ⌘K
              </kbd>
              <span>to search</span>
            </span>
          </TopBar>
        }
        ticker={<TickerTape items={tickerItems} />}
        left={
          <ExplorerRail
            spaces={spaces}
            terminals={terminals}
            toolCount={toolCount}
            userName={userName}
            userEmail={userEmail}
            isPlatformAdmin={isPlatformAdmin}
            canCreateSpace={isPlatformAdmin}
          />
        }
        center={
          <div className="card-stack flex flex-col gap-3 p-2 sm:p-3">
            <BriefingCard
              userName={userName}
              dismissedOn={briefingDismissedOn}
            />
            <WeekCard items={weekItems} />
            <TasksCard
              assigned={assigned}
              delegated={delegated}
              tickerById={tickerById}
              terminalNameById={terminalNameById}
            />
          </div>
        }
        right={
          <div className="card-stack flex flex-col gap-3 p-2 sm:p-3">
            <MessagesCard />
          </div>
        }
      />
      <CreateOrgDialog
        open={spaceDialog}
        onClose={() => setSpaceDialog(false)}
      />
      <CreateProjectDialog
        open={terminalDialog}
        onClose={() => {
          setTerminalDialog(false);
          setPreferredSpaceSlug(null);
        }}
        orgs={spaces}
        preferredSlug={preferredSpaceSlug ?? undefined}
      />
      <TimezoneProbe currentTimezone={savedTimezone} />
    </DensityProvider>
  );
}

function greeting(name: string): string {
  const h = new Date().getHours();
  if (h < 12) return `Good morning, ${name}`;
  if (h < 18) return `Good afternoon, ${name}`;
  return `Good evening, ${name}`;
}
