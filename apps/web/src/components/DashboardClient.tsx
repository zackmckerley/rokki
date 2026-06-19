"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Focus, X } from "lucide-react";
import { DashboardShell } from "./dashboard/DashboardShell";
import { ExplorerRail } from "./dashboard/ExplorerRail";
import { MessagesCard } from "./dashboard/MessagesCard";
import { MarketsCard } from "./dashboard/MarketsCard";
import { GoalsCard } from "./dashboard/GoalsCard";
import { DashboardPanels } from "./dashboard/DashboardPanels";
import { ModuleVisibilityProvider } from "./dashboard/module-visibility";
import { PresenceProvider } from "./presence/PresenceProvider";
import { UnreadTitleBadge } from "./messages/UnreadTitleBadge";
import { TerminalScopeFilter } from "./dashboard/TerminalScopeFilter";
import { TopBar } from "./TopBar";
import { DensityProvider, type Density } from "@/lib/density";
import { useRefreshOnFocus } from "@/lib/use-refresh-on-focus";
import { TimezoneProbe } from "./TimezoneProbe";
import { BriefingCard } from "./dashboard/BriefingCard";
import { isEditableTarget } from "@/lib/shortcuts";
import type {
  DashSpace,
  DashTerminal,
} from "@/lib/dashboard-queries";

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

interface DashboardClientProps {
  spaces: DashSpace[];
  terminals: DashTerminal[];
  userId: string;
  userName: string;
  userEmail: string;
  isPlatformAdmin: boolean;
  initialDensity: Density;
  savedTimezone: string | null;
  briefingDismissedOn: string | null;
  /**
   * Dashboard-level terminal scope — server-resolved from the
   * `?focus=<id>` URL param. `null` = "all terminals". The filter
   * button in the topbar mutates the URL; the server re-runs and
   * passes the new value back in here.
   */
  focusTerminalId: string | null;
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
  userId,
  userName,
  userEmail,
  isPlatformAdmin,
  initialDensity,
  savedTimezone,
  briefingDismissedOn,
  focusTerminalId,
  tickerSlot,
  weekSlot,
  tasksSlot,
}: DashboardClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Resilience fallback for blocked realtime websockets (corporate
  // networks): refetch the whole dashboard whenever the user returns to
  // the tab or the browser reconnects, so the data is current even when
  // live pushes never arrive. router.refresh() re-runs the server
  // components behind every slot (Tasks, Week, Ticker, Briefing).
  useRefreshOnFocus(() => router.refresh());

  const [spaceDialog, setSpaceDialog] = useState(false);
  const [terminalDialog, setTerminalDialog] = useState(false);
  const [taskDialog, setTaskDialog] = useState(false);
  const [preferredSpaceSlug, setPreferredSpaceSlug] = useState<string | null>(
    null,
  );

  // Resolve the active focus's display data for the banner. The
  // server already validated `focusTerminalId` against the viewer's
  // visible terminals, so a falsy lookup means "no focus active".
  const focused = focusTerminalId
    ? terminals.find((t) => t.id === focusTerminalId) ?? null
    : null;

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

  // "New task" buttons (dashboard TasksCard) dispatch this cancelable event
  // instead of navigating to `/?new=task`. Opening the dialog in place
  // avoids an App Router searchParams navigation that would refetch every
  // streamed slot (Tasks / Week / Ticker) — the visible flash + delay Zack
  // reported. preventDefault() tells the dispatcher we handled it so it
  // skips its URL fallback.
  useEffect(() => {
    function onOpen(e: Event) {
      if (terminals.length === 0) return;
      e.preventDefault();
      setTaskDialog(true);
    }
    window.addEventListener("rokki:open-new-task", onOpen);
    return () => window.removeEventListener("rokki:open-new-task", onOpen);
  }, [terminals.length]);

  // Warm the quick-task dialog chunk once the dashboard is idle so the
  // FIRST open is instant rather than waiting on its lazy import.
  useEffect(() => {
    const warm = () => {
      void import("./QuickTaskDialog");
    };
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(warm);
      return () => window.cancelIdleCallback(id);
    }
    const t = setTimeout(warm, 1200);
    return () => clearTimeout(t);
  }, []);

  return (
    <DensityProvider initial={initialDensity}>
      <PresenceProvider>
      <ModuleVisibilityProvider>
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
            {/* Focus filter — scopes Week, Tasks, and Ticker to a
                single terminal. URL-driven via `?focus=<id>`; the
                server re-renders with the narrowed slot queries.
                Aligned right so it sits next to the search box without
                competing with the greeting. */}
            <div className="ml-auto flex items-center gap-2">
              <TerminalScopeFilter
                terminals={terminals}
                spaces={spaces}
                scopeTerminalId={focusTerminalId}
              />
            </div>
          </TopBar>
        }
        ticker={tickerSlot}
        left={
          <ExplorerRail
            spaces={spaces}
            terminals={terminals}
            userName={userName}
            userEmail={userEmail}
            isPlatformAdmin={isPlatformAdmin}
          />
        }
        center={
          <DashboardPanels
            focus={
              focused ? (
                <FocusBanner
                  ticker={focused.ticker}
                  name={focused.name}
                  searchParams={searchParams}
                />
              ) : null
            }
            briefing={
              <BriefingCard
                userName={userName}
                dismissedOn={briefingDismissedOn}
              />
            }
            week={weekSlot}
            tasks={tasksSlot}
            messages={<MessagesCard />}
            markets={<MarketsCard />}
            goals={<GoalsCard />}
          />
        }
      />
      </ModuleVisibilityProvider>
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
      <UnreadTitleBadge />
      </PresenceProvider>
    </DensityProvider>
  );
}

function greeting(name: string): string {
  const h = new Date().getHours();
  if (h < 12) return `Good morning, ${name}`;
  if (h < 18) return `Good afternoon, ${name}`;
  return `Good evening, ${name}`;
}

/**
 * Subtle banner explaining the active focus filter.
 *
 * The picker in the topbar already shows the active ticker, but
 * without this banner an empty Week or Tasks card ("Your week is
 * clear", "Nothing assigned to you") could be misread as "I have
 * no work" instead of "this one terminal has no work". The banner
 * makes the filtered state legible at a glance and gives the user
 * a one-click escape.
 */
function FocusBanner({
  ticker,
  name,
  searchParams,
}: {
  ticker: string;
  name: string;
  searchParams: URLSearchParams;
}) {
  // Build the "clear focus" href by stripping the `focus` param.
  const cleared = new URLSearchParams(searchParams.toString());
  cleared.delete("focus");
  const clearHref = `/${cleared.size ? `?${cleared.toString()}` : ""}`;
  return (
    <div className="flex items-center gap-2 rounded border border-accent/30 bg-accent-subtle px-3 py-1.5 text-[11px] text-text-1">
      <Focus className="h-3 w-3 flex-shrink-0 text-accent" aria-hidden="true" />
      <span className="text-text-2">Showing only</span>
      <span className="font-mono text-[10px] text-accent">{ticker}</span>
      <span className="truncate text-text-1">· {name}</span>
      <Link
        href={clearHref}
        className="ml-auto flex flex-shrink-0 items-center gap-1 rounded-sm border border-border bg-bg-2 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-text-2 hover:border-border-focus hover:text-text-0"
      >
        <X className="h-3 w-3" aria-hidden="true" />
        <span>Clear</span>
      </Link>
    </div>
  );
}
