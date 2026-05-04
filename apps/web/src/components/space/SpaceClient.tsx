"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { TopBar } from "@/components/TopBar";
import { TickerTape } from "@/components/TickerTape";
import { ExplorerRail } from "@/components/dashboard/ExplorerRail";
import { DensityProvider, type Density } from "@/lib/density";
import { TerminalsGrid } from "./TerminalsGrid";
import { SpaceTasksCard } from "./SpaceTasksCard";
import { SpaceWeekCard } from "./SpaceWeekCard";
import { SpaceMembersCard } from "./SpaceMembersCard";
import { SpaceLobbyCard } from "./SpaceLobbyCard";
import { SpaceFilesCard } from "./SpaceFilesCard";
import type {
  DashSpace,
  DashTerminal,
} from "@/lib/dashboard-queries";
import type {
  SpaceTerminalCard,
  SpaceTaskRow,
  SpaceMemberRow,
  SpaceLobbyMessage,
  SpaceFileRow,
  SpaceWeekItem,
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
  weekItems: SpaceWeekItem[];
  lobby: { hasThread: boolean; messages: SpaceLobbyMessage[] };
  files: SpaceFileRow[];
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
  weekItems,
  lobby,
  files,
  tickerItems,
}: SpaceClientProps) {
  const canManage = myRole === "owner" || myRole === "admin";
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
            {canManage ? (
              <Link
                href={`/s/${space.slug}/settings`}
                aria-label={`${space.name} settings`}
                title="Space settings"
                className="rounded-sm p-1 text-text-3 hover:bg-bg-2 hover:text-text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                <Settings className="h-3 w-3" aria-hidden="true" />
              </Link>
            ) : null}
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

            {/* Two side-by-side roll-ups: tasks + week. Both are
                "look across the space" surfaces; pairing them keeps
                the overview shape compact. Stacks on narrow viewports. */}
            <div className="grid gap-3 lg:grid-cols-2">
              <SpaceTasksCard
                assignedToMe={tasks.assignedToMe}
                overdue={tasks.overdue}
                blocked={tasks.blocked}
                dueThisWeek={tasks.dueThisWeek}
              />
              <SpaceWeekCard items={weekItems} />
            </div>

            {/* Members + Lobby — the social pair. */}
            <div className="grid gap-3 lg:grid-cols-2">
              <SpaceMembersCard members={members} />
              <SpaceLobbyCard
                spaceName={space.name}
                messages={lobby.messages}
                hasThread={lobby.hasThread}
              />
            </div>

            <SpaceFilesCard files={files} />
          </div>
        }
        right={
          /* Right rail is empty on the space landing — the ticker
             tape across the top already serves as "what's happening
             across the space," and the center is dense enough that
             a third column would just compete for attention. */
          <div className="hidden" aria-hidden="true" />
        }
      />
    </DensityProvider>
  );
}
