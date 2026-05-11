"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams, useRouter } from "next/navigation";
import { DashboardShell } from "./dashboard/DashboardShell";
import { ExplorerRail } from "./dashboard/ExplorerRail";
import { MessagesCard } from "./dashboard/MessagesCard";
import { TopBar } from "./TopBar";
import { DensityProvider, type Density } from "@/lib/density";
import { TimezoneProbe } from "./TimezoneProbe";
import { BriefingCard } from "./dashboard/BriefingCard";
import { isEditableTarget } from "@/lib/shortcuts";

// Dialogs are heavy (forms, validation, member pickers) but only ever
// render when the user explicitly opens them via ⌘N, +Terminal, or
// the URL `?new=` param. Code-splitting trims ~40-60 KB off the
// dashboard's initial JS — the user pays for the dialog only when
// they need it. SSR off because there's no useful server render of a
// closed dialog.
const QuickTaskDialog = dynamic(
  () =>
    import("./QuickTaskDialog").then((m) => ({ default: m.QuickTaskDialog })),
  { ssr: false },
);
const CreateOrgDialog = dynamic(
  () =>
    import("./CreateOrgDialog").then((m) => ({ default: m.CreateOrgDialog })),
  { ssr: false },
);
const CreateProjectDialog = dynamic(
  () =>
    import("./CreateProjectDialog").then((m) => ({
      default: m.CreateProjectDialog,
    })),
  { ssr: false },
);
import type {
  DashSpace,
  DashTerminal,
} from "@/lib/dashboard-queries";

interface DashboardClientProps {
  spaces: DashSpace[];
  terminals: DashTerminal[];
  toolCount: number;
  userId: string;
  userName: string;
  userEmail: string;
  isPlatformAdmin: boolean;
  initialDensity: Density;
  savedTimezone: string | null;
  briefingDismissedOn: string | null;
  /**
   * Streamed slots. Each is rendered by the route as a Suspense
   * boundary so the dashboard's shell + fast cards (Briefing, Explorer,
   * Messages) paint at ~50ms while the slow ones (Tasks, Week, Ticker)
   * stream in over the wire. The slots come in as ReactNodes (rather
   * than raw data) so this Client Component doesn't have to await
   * anything itself — Suspense lives in the parent Server Component
   * and resolves before React hydrates the eventual content here.
   */
  tickerSlot: ReactNode;
  weekSlot: ReactNode;
  tasksSlot: ReactNode;
}

/**
 * Dashboard composition root. Owns the layout shell, dialog state,
 * keyboard shortcuts, and `?new=…` URL handling. Card content
 * (tasks, week-items, ticker) streams in as Suspended slots from the
 * parent route — see `app/page.tsx` for the boundary wiring.
 *
 * Data still arrives via props for the shell-level concerns
 * (spaces/terminals fed into ExplorerRail; userName/email for the
 * top bar). Those queries are fast and need to be ready before the
 * shell renders so the rail isn't a placeholder.
 */
export function DashboardClient({
  spaces,
  terminals,
  toolCount,
  userId,
  userName,
  userEmail,
  isPlatformAdmin,
  initialDensity,
  savedTimezone,
  briefingDismissedOn,
  tickerSlot,
  weekSlot,
  tasksSlot,
}: DashboardClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [spaceDialog, setSpaceDialog] = useState(false);
  const [terminalDialog, setTerminalDialog] = useState(false);
  const [taskDialog, setTaskDialog] = useState(false);
  const [preferredSpaceSlug, setPreferredSpaceSlug] = useState<string | null>(
    null,
  );

  // Respect ?new=space / ?new=terminal&space=<slug> / ?new=task from the
  // palette or explorer.
  useEffect(() => {
    const want = searchParams.get("new");
    const spaceHint = searchParams.get("space");
    if (want === "space" && isPlatformAdmin) setSpaceDialog(true);
    if (want === "terminal" && spaces.length > 0) {
      setPreferredSpaceSlug(spaceHint);
      setTerminalDialog(true);
    }
    if (want === "task" && terminals.length > 0) setTaskDialog(true);
    if (want) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("new");
      params.delete("space");
      router.replace(`/${params.size ? `?${params.toString()}` : ""}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ⌘N / Ctrl+N → open the quick-task dialog from anywhere on the
  // dashboard. Skip when typing in an input/textarea/contenteditable
  // so the shortcut doesn't fight a real keystroke.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.shiftKey || e.altKey) return;
      if (e.key.toLowerCase() !== "n") return;
      if (isEditableTarget(e.target)) return;
      if (terminals.length === 0) return;
      e.preventDefault();
      setTaskDialog(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [terminals.length]);

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
            {/* Topbar right side stays empty here — the TopBarSearch
                component (rendered by <TopBar />) already shows the
                ⌘K hint inside the search button. The standalone
                "+ New task" button moved into the TasksCard header,
                where it reads as a tasks-affordance instead of
                global chrome. ⌘N still works globally. */}
          </TopBar>
        }
        ticker={tickerSlot}
        left={
          <ExplorerRail
            spaces={spaces}
            terminals={terminals}
            toolCount={toolCount}
            userName={userName}
            userEmail={userEmail}
            isPlatformAdmin={isPlatformAdmin}
          />
        }
        center={
          <div className="card-stack flex flex-col gap-3 p-2 sm:p-3">
            <BriefingCard
              userName={userName}
              dismissedOn={briefingDismissedOn}
            />
            {weekSlot}
            {tasksSlot}
          </div>
        }
        right={
          <div className="card-stack flex flex-col gap-3 p-2 sm:p-3">
            <MessagesCard />
          </div>
        }
      />
      {/* Conditional mounting (not just open=false) — combined with
          the `dynamic()` imports above, the dialog code only ships
          to the client when the user actually opens one. Trims
          ~40-60 KB off the dashboard's initial JS payload. */}
      {spaceDialog ? (
        <CreateOrgDialog
          open={spaceDialog}
          onClose={() => setSpaceDialog(false)}
        />
      ) : null}
      {terminalDialog ? (
        <CreateProjectDialog
          open={terminalDialog}
          onClose={() => {
            setTerminalDialog(false);
            setPreferredSpaceSlug(null);
          }}
          orgs={spaces}
          preferredSlug={preferredSpaceSlug ?? undefined}
        />
      ) : null}
      {taskDialog ? (
        <QuickTaskDialog
          open={taskDialog}
          onClose={() => setTaskDialog(false)}
          terminals={terminals}
          spaces={spaces}
          currentUserId={userId}
        />
      ) : null}
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
