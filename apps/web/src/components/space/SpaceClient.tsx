"use client";

import Link from "next/link";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { TopBar } from "@/components/TopBar";
import { TickerTape } from "@/components/TickerTape";
import { ExplorerRail } from "@/components/dashboard/ExplorerRail";
import { DensityProvider, type Density } from "@/lib/density";
import { TerminalsGrid } from "./TerminalsGrid";
import { SpaceTasksCard } from "./SpaceTasksCard";
import { SpaceMembersCard } from "./SpaceMembersCard";
import { SpaceLobbyCard } from "./SpaceLobbyCard";
import type {
  DashSpace,
  DashTerminal,
} from "@/lib/dashboard-queries";
import type {
  SpaceTerminalCard,
  SpaceTaskRow,
  SpaceMemberRow,
  SpaceLobbyMessage,
} from "@/lib/space-queries";

interface SpaceClientProps {
  space: { id: string; slug: string; name: string };
  /** Caller's role in the space — used for owner/admin-gated UI. */
  myRole: "owner" | "admin" | "member";
  /** Spaces shown in the explorer rail. */
  spaces: DashSpace[];
  /** Terminals shown in the explorer rail (all visible to the user). */
  allTerminals: DashTerminal[];
  toolCount: number;
  userName: string;
  userEmail: string;
  isPlatformAdmin: boolean;
  initialDensity: Density;

  // Space landing data
  terminals: SpaceTerminalCard[];
  tasks: {
    assignedToMe: SpaceTaskRow[];
    overdue: SpaceTaskRow[];
    blocked: SpaceTaskRow[];
    dueThisWeek: SpaceTaskRow[];
  };
  members: SpaceMemberRow[];
  lobby: { hasThread: boolean; messages: SpaceLobbyMessage[] };
  tickerItems: { id: string; text: string; when: string }[];
}

/**
 * Composition root for the space landing (`/s/:slug`).
 *
 * Reuses the `DashboardShell` layout (topbar / ticker / explorer /
 * center) so navigating between dashboard, space, and terminal
 * feels like one continuous app rather than three different
 * surfaces. The center column is a simple vertical stack — keep
 * the overview easy to scan, click into a terminal for depth.
 */
export function SpaceClient({
  space,
  myRole,
  spaces,
  allTerminals,
  toolCount,
  userName,
  userEmail,
  isPlatformAdmin,
  initialDensity,
  terminals,
  tasks,
  members,
  lobby,
  tickerItems,
}: SpaceClientProps) {
  // myRole is consumed by the parent route's auth gate (member-only
  // landing); we don't render any role-gated chrome on this page.
  void myRole;
  return (
    <DensityProvider initial={initialDensity}>
      <DashboardShell
        topBar={
          <TopBar>
            <span className="text-text-3">/</span>
            <Link href="/" className="text-text-1 hover:text-text-0">
              Dashboard
            </Link>
            <span className="text-text-3">/</span>
            <span className="text-text-0 font-medium">{space.name}</span>
            {/* No Settings cog up here per UX feedback ("dont need
                the setting gear up top when i go into the space").
                Space admin (rename, members, archive) lives at
                /s/<slug>/settings — reachable via direct URL or
                the command palette. */}
          </TopBar>
        }
        ticker={<TickerTape items={tickerItems} />}
        left={
          <ExplorerRail
            spaces={spaces}
            terminals={allTerminals}
            toolCount={toolCount}
            userName={userName}
            userEmail={userEmail}
            isPlatformAdmin={isPlatformAdmin}
          />
        }
        center={
          <div className="card-stack flex flex-col gap-3 p-2 sm:p-3">
            {/* The grid is the lead — what does this space actually
                have? — stretched full width. */}
            <TerminalsGrid terminals={terminals} />

            {/* Tasks roll-up sits below — the cross-cutting "what's
                actually moving" view. Members live next to it on
                wide viewports, stacks below on narrow ones. */}
            <div className="grid gap-3 lg:grid-cols-2">
              <SpaceTasksCard
                assignedToMe={tasks.assignedToMe}
                overdue={tasks.overdue}
                blocked={tasks.blocked}
                dueThisWeek={tasks.dueThisWeek}
              />
              <SpaceMembersCard members={members} />
            </div>
          </div>
        }
        right={
          /* The space's lobby thread lives in the right rail —
             same shape as the dashboard's MessagesCard. Title is
             plain "Messages" because that's what the user calls
             it; "lobby" was internal jargon. */
          <div className="card-stack flex flex-col gap-3 p-2 sm:p-3">
            <SpaceLobbyCard
              spaceName={space.name}
              messages={lobby.messages}
              hasThread={lobby.hasThread}
            />
          </div>
        }
      />
    </DensityProvider>
  );
}
