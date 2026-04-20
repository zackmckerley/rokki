"use client";

import { useState, type ReactNode } from "react";
import { TerminalShell } from "./TerminalShell";
import { TasksPane } from "./TasksPane";
import { TeamPane } from "./TeamPane";
import { FilesPane } from "./FilesPane";
import { CORE_FUNCTION_KEYS } from "@/lib/project-templates";
import type { ProjectStatus } from "@rokki/db";

interface ProjectTerminalProps {
  topBar: ReactNode;
  overviewLeft: ReactNode;
  overviewMain: ReactNode;
  rightPane: ReactNode;
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
  ticker,
  project,
  tickerItems,
  isOwnerOrManager,
}: ProjectTerminalProps) {
  const [activeKey, setActiveKey] = useState("F3");

  const { mainPane, leftPane } = resolvePanes({
    activeKey,
    ticker,
    projectId: project.id,
    isOwnerOrManager,
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
  overviewLeft,
  overviewMain,
}: {
  activeKey: string;
  ticker: string;
  projectId: string;
  isOwnerOrManager: boolean;
  overviewLeft: ReactNode;
  overviewMain: ReactNode;
}): { mainPane: ReactNode; leftPane: ReactNode } {
  switch (activeKey) {
    case "F2":
      return {
        mainPane: <FilesPane ticker={ticker} projectId={projectId} />,
        leftPane: <FilesSideRail />,
      };
    case "F3":
      return {
        mainPane: <TasksPane ticker={ticker} projectId={projectId} />,
        leftPane: <TasksSideRail />,
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
        leftPane: <TeamSideRail canInvite={isOwnerOrManager} />,
      };
    default:
      return { mainPane: overviewMain, leftPane: overviewLeft };
  }
}

function FilesSideRail() {
  return (
    <div className="space-y-6 p-4">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-3">
          Tips
        </h3>
        <ul className="space-y-1.5 text-xs text-text-2">
          <li>Drag files onto this pane to upload.</li>
          <li>Max 25 MB per file in this slice.</li>
          <li>Hover a row to download or delete.</li>
        </ul>
      </section>
    </div>
  );
}

function TasksSideRail() {
  return (
    <div className="space-y-6 p-4">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-3">
          Keyboard
        </h3>
        <dl className="space-y-1.5 text-xs">
          <Shortcut keys={["J", "K"]} label="Navigate" />
          <Shortcut keys={["Enter"]} label="Toggle complete" />
          <Shortcut keys={["⌘", "Enter"]} label="Mark done" />
          <Shortcut keys={["C"]} label="New task" />
          <Shortcut keys={["Esc"]} label="Cancel" />
        </dl>
      </section>
    </div>
  );
}

function TeamSideRail({ canInvite }: { canInvite: boolean }) {
  return (
    <div className="space-y-6 p-4">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-3">
          Roles
        </h3>
        <dl className="space-y-1.5 text-xs">
          <RoleLine role="Owner" note="Full control, can delete the space" />
          <RoleLine role="Manager" note="Manage team and settings" />
          <RoleLine role="Member" note="Edit tasks, upload files" />
          <RoleLine role="Guest" note="Scoped read access" />
        </dl>
      </section>
      {canInvite ? (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-3">
            Keyboard
          </h3>
          <dl className="space-y-1.5 text-xs">
            <Shortcut keys={["I"]} label="Invite someone" />
            <Shortcut keys={["Esc"]} label="Close dialog" />
          </dl>
        </section>
      ) : null}
    </div>
  );
}

function Shortcut({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-text-1">{label}</dt>
      <dd className="flex items-center gap-1">
        {keys.map((k, i) => (
          <kbd
            key={i}
            className="rounded-sm border border-border bg-bg-2 px-1.5 py-0.5 font-mono text-[10px] text-text-1"
          >
            {k}
          </kbd>
        ))}
      </dd>
    </div>
  );
}

function RoleLine({ role, note }: { role: string; note: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="font-medium text-text-1">{role}</dt>
      <dd className="text-text-3">{note}</dd>
    </div>
  );
}
