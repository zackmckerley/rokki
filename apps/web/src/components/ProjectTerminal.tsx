"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Settings } from "lucide-react";
import { TerminalShell } from "./TerminalShell";
import { TasksPane } from "./TasksPane";
import { TeamPane } from "./TeamPane";
import { FilesPane } from "./FilesPane";
import { useRegisterCommands } from "@/lib/use-register-commands";
import { CORE_FUNCTION_KEYS } from "@/lib/project-templates";
import type { ProjectStatus } from "@rokki/db";

interface ProjectTerminalProps {
  topBar: ReactNode;
  overviewLeft: ReactNode;
  overviewMain: ReactNode;
  rightPane: ReactNode;
  /**
   * Global ExplorerRail (spaces → terminals tree, recents, tools,
   * AccountBlock). Rendered as the left column of the shell below the
   * topbar. Pre-PR-#88 this lived in the route layout's aside which
   * sat *next to* the topbar instead of below it; hoisting it here
   * matches the dashboard's column-then-row shape.
   */
  leftRail: ReactNode;
  ticker: string;
  project: {
    id: string;
    name: string;
    ticker: string;
    status: ProjectStatus;
    type: string;
  };
  tickerItems: { id: string; text: string; when: string }[];
  isOwnerOrManager: boolean;
  /** Current viewer's user_id, used by inline composers to default-assign self. */
  currentUserId: string;
}

/**
 * Client-side pane switcher. Every space gets the same universal F-keys —
 * optional modules (F5+) attach per-space in Phase 2.
 */
export function ProjectTerminal({
  topBar,
  overviewLeft,
  overviewMain,
  rightPane,
  leftRail,
  ticker,
  project,
  tickerItems,
  isOwnerOrManager,
  currentUserId,
}: ProjectTerminalProps) {
  const router = useRouter();
  const [activeKey, setActiveKey] = useState("F3");

  // Register a per-terminal "Terminal settings" command so ⌘K →
  // "settings" surfaces a route into the current terminal's admin
  // (rename, members, archive). The breadcrumb cog covers the
  // mouse path; this covers the keyboard one.
  const terminalCommands = useMemo(
    () => [
      {
        id: `terminal/settings:${project.id}`,
        title: "Terminal settings",
        subtitle: `${project.ticker} · ${project.name}`,
        category: "navigation" as const,
        icon: <Settings className="h-3.5 w-3.5" />,
        keywords: [
          "rename",
          "members",
          "archive",
          "permissions",
          project.ticker.toLowerCase(),
        ],
        onRun: () => router.push(`/p/${project.ticker}/settings`),
      },
    ],
    [project.id, project.ticker, project.name, router],
  );
  useRegisterCommands(`terminal:${project.id}`, terminalCommands);

  const { mainPane, leftPane } = resolvePanes({
    activeKey,
    ticker,
    projectId: project.id,
    isOwnerOrManager,
    currentUserId,
    overviewLeft,
    overviewMain,
  });

  return (
    <TerminalShell
      topBar={topBar}
      functionKeys={CORE_FUNCTION_KEYS}
      activeKey={activeKey}
      onFunctionKey={setActiveKey}
      tickerItems={tickerItems}
      tickerProjectId={project.id}
      leftRail={leftRail}
      leftPane={leftPane}
      mainPane={mainPane}
      rightPane={rightPane}
    />
  );
}

function resolvePanes({
  activeKey,
  ticker,
  projectId,
  isOwnerOrManager,
  currentUserId,
  overviewLeft,
  overviewMain,
}: {
  activeKey: string;
  ticker: string;
  projectId: string;
  isOwnerOrManager: boolean;
  currentUserId: string;
  overviewLeft: ReactNode;
  overviewMain: ReactNode;
}): { mainPane: ReactNode; leftPane: ReactNode } {
  // Files / Tasks / Team don't have a side rail — the previous "Tips",
  // "Keyboard", and "Roles" reference panels weren't earning their
  // rail width. Only the Overview tab keeps a contextual rail.
  switch (activeKey) {
    case "F2":
      return {
        mainPane: <FilesPane ticker={ticker} projectId={projectId} />,
        leftPane: null,
      };
    case "F3":
      return {
        mainPane: (
          <TasksPane
            ticker={ticker}
            projectId={projectId}
            currentUserId={currentUserId}
          />
        ),
        leftPane: null,
      };
    case "F4":
      return {
        mainPane: (
          <TeamPane
            ticker={ticker}
            projectId={projectId}
            canInvite={isOwnerOrManager}
          />
        ),
        leftPane: null,
      };
    default:
      return { mainPane: overviewMain, leftPane: overviewLeft };
  }
}

