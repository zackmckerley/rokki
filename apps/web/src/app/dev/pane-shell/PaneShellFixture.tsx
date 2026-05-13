"use client";

import { useState } from "react";
import { PaneArea } from "@/components/pane/PaneArea";
import { PaneShell } from "@/components/pane/PaneShell";
import { ScopeRail, type ScopeRailSpace } from "@/components/pane/ScopeRail";
import { usePinnedModules } from "@/components/pane/usePinnedModules";
import { useFKeyShortcuts } from "@/components/pane/useFKeyShortcuts";
import type { InstalledModuleEntry, PaneScope } from "@/components/pane/types";

/**
 * Static fixture matching the v5 sketch. No DB reads — every value is
 * in memory so the page paints fast and we can verify the pane-shell
 * components hang together visually.
 *
 * Wire-up to live data lands in Phase 1+.
 */
export function PaneShellFixture() {
  const [scope, setScope] = useState<PaneScope>(FIXTURE_SCOPE_HELIOS);
  const [activeSlug, setActiveSlug] = useState<string | null>("goals");

  const modules = usePinnedModules({
    installed: scopeModules(scope),
    scope,
    maxPinned: 5,
  });

  // F-key shortcuts: F5 → Goals, F6 → Schedule (matching the shelf
  // labels below). Pin set is hard-coded here for the fixture; the
  // real dashboard will pull from /api/v1/me/module-pins.
  useFKeyShortcuts(
    {
      kind: scope.kind,
      key:
        scope.kind === "space"
          ? scope.slug
          : scope.kind === "terminal"
            ? scope.ticker
            : undefined,
    },
    [
      { slug: "goals", fnKey: 5 },
      { slug: "schedule", fnKey: 6 },
    ],
  );

  return (
    <div className="grid h-[100dvh] grid-cols-[240px_1fr] grid-rows-[44px_1fr_28px] overflow-hidden bg-bg-0">
      {/* Top bar */}
      <header className="col-span-2 flex items-center gap-3 border-b border-border bg-bg-1 px-4">
        <span className="font-display text-base font-semibold text-text-0">
          Rokki<span className="ml-1 text-accent">·</span>
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wide text-text-2">
          {breadcrumb(scope, activeSlug, modules)}
        </span>
        <span className="ml-auto rounded-sm border border-border bg-bg-2 px-2 py-1 text-[11px] text-text-3">
          Pane-shell fixture · Phase 0
        </span>
      </header>

      {/* Sidebar */}
      <aside className="border-r border-border bg-bg-1">
        <ScopeRail
          spaces={FIXTURE_SPACES}
          activeId={scopeActiveId(scope)}
          onSelectHome={() => {
            setScope({ kind: "user", label: "Home" });
            setActiveSlug(null);
          }}
          onSelectSpace={(s) => {
            setScope({
              kind: "space",
              id: s.id,
              slug: s.slug,
              label: s.name.toUpperCase(),
            });
            setActiveSlug(null);
          }}
          onSelectTerminal={(t, s) => {
            setScope({
              kind: "terminal",
              id: t.id,
              ticker: t.ticker,
              label: `${s.name.toUpperCase()} / ${t.name}`,
            });
            setActiveSlug(null);
          }}
          onAddTerminal={(s) => alert(`Would open: new terminal in ${s.name}`)}
          onSpaceSettings={(s) => alert(`Would open: ${s.name} settings`)}
          onTerminalSettings={(t) => alert(`Would open: ${t.name} settings`)}
        />
      </aside>

      {/* Pane area */}
      <main className="min-h-0 overflow-hidden">
        <PaneArea initialLayout="single">
          <PaneShell
            scope={scope}
            modules={modules}
            activeSlug={activeSlug}
            focused
            onSelectTab={setActiveSlug}
            onAddModule={() =>
              alert(`Would open: add module to ${scope.label}`)
            }
            onSettings={() => alert("Would open: module settings")}
            onClose={null}
          >
            <FixtureBody scope={scope} activeSlug={activeSlug} />
          </PaneShell>
        </PaneArea>
      </main>

      {/* F-key shelf */}
      <footer className="col-span-2 flex items-center gap-4 border-t border-border bg-bg-1 px-3 text-[11px] text-text-2">
        <Fn k="F1" l="Help" />
        <Fn k="F2" l="Tasks" />
        <Fn k="F3" l="Files" />
        <Fn k="F4" l="Tools" muted />
        <Fn k="F5" l="Goals" />
        <Fn k="F6" l="Schedule" />
        <Fn k="⌘K" l="Search" />
        <Fn k="⌘2" l="Split" />
        <span className="ml-auto font-mono text-[10px] text-text-3">
          Static fixture · no live data
        </span>
      </footer>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────── */
/* Helpers                                                            */
/* ───────────────────────────────────────────────────────────────── */

function Fn({ k, l, muted }: { k: string; l: string; muted?: boolean }) {
  return (
    <span
      className={muted ? "text-text-3 opacity-60" : "text-text-2"}
      title={muted ? `${l} — coming back later (locked decision #5)` : undefined}
    >
      <span className="rounded-sm border border-border bg-bg-2 px-1 font-mono text-[9px] text-text-1">
        {k}
      </span>{" "}
      {l}
    </span>
  );
}

function breadcrumb(
  scope: PaneScope,
  activeSlug: string | null,
  modules: ReturnType<typeof usePinnedModules>,
): string {
  const all = [...modules.pinned, ...modules.overflow];
  const moduleName = activeSlug
    ? (all.find((m) => m.slug === activeSlug)?.name ?? "Overview")
    : "Overview";
  return `${scope.label} / ${moduleName.toUpperCase()}`;
}

function scopeActiveId(scope: PaneScope): string | null {
  if (scope.kind === "user") return null;
  return scope.id;
}

function scopeModules(scope: PaneScope): InstalledModuleEntry[] {
  // Phase 0 just returns a fixed per-scope-kind set so the tab strip
  // looks plausible. Real data lands in Phase 1.
  const TASKS: InstalledModuleEntry = {
    slug: "tasks",
    name: "Tasks",
    icon: "check-square",
    scope: scope.kind,
    displayOrder: 1,
    pinned: true,
  };
  const FILES: InstalledModuleEntry = {
    slug: "files",
    name: "Files",
    icon: "folder",
    scope: scope.kind,
    displayOrder: 2,
    pinned: true,
  };
  const MESSENGER: InstalledModuleEntry = {
    slug: "messenger",
    name: "Messenger",
    icon: "message-square",
    scope: scope.kind,
    displayOrder: 3,
    pinned: true,
  };
  const SCHEDULE: InstalledModuleEntry = {
    slug: "schedule",
    name: "Schedule",
    icon: "calendar",
    scope: scope.kind,
    displayOrder: 4,
    pinned: true,
  };
  const GOALS: InstalledModuleEntry = {
    slug: "goals",
    name: "Goals",
    icon: "target",
    scope: scope.kind,
    displayOrder: 5,
    pinned: true,
  };
  // Extras to populate the overflow.
  const DOCUMENTS: InstalledModuleEntry = {
    slug: "documents",
    name: "Documents",
    icon: "file-text",
    scope: scope.kind,
    displayOrder: 6,
    pinned: false,
  };
  const REPORTS: InstalledModuleEntry = {
    slug: "reports",
    name: "Reports",
    icon: "bar-chart",
    scope: scope.kind,
    displayOrder: 7,
    pinned: false,
  };

  if (scope.kind === "user") {
    return [TASKS, SCHEDULE, MESSENGER, GOALS];
  }
  return [TASKS, FILES, MESSENGER, SCHEDULE, GOALS, DOCUMENTS, REPORTS];
}

function FixtureBody({
  scope,
  activeSlug,
}: {
  scope: PaneScope;
  activeSlug: string | null;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="text-xs uppercase tracking-wide text-text-3">
        Fixture body
      </p>
      <p className="text-sm text-text-1">
        {activeSlug
          ? `Active module "${activeSlug}" for scope ${scope.label}`
          : `Overview screen for ${scope.label} (no module loaded)`}
      </p>
      <p className="max-w-md text-xs text-text-3">
        Phase 1 mounts the real module content here.
      </p>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────── */
/* Fixture data                                                       */
/* ───────────────────────────────────────────────────────────────── */

const FIXTURE_SPACES: ScopeRailSpace[] = [
  {
    id: "space-helios",
    slug: "helios",
    name: "HELIOS",
    dotColor: "#e0b973",
    terminals: [
      { id: "t-casa", ticker: "CASA", name: "Casablanca" },
      { id: "t-hm", ticker: "HM", name: "Helen Mar" },
      { id: "t-bh", ticker: "BH", name: "Bay House" },
      { id: "t-ccp", ticker: "CCP", name: "Coco Palm" },
    ],
  },
  {
    id: "space-personal",
    slug: "personal",
    name: "Personal",
    dotColor: "#7aa0c4",
    terminals: [],
  },
];

const FIXTURE_SCOPE_HELIOS: PaneScope = {
  kind: "space",
  id: "space-helios",
  slug: "helios",
  label: "HELIOS",
};
