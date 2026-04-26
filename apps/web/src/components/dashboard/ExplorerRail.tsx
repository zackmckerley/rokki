"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Plus,
  Settings,
  Sparkles,
} from "lucide-react";
import type { DashSpace, DashTerminal } from "@/lib/dashboard-queries";
import { AccountBlock } from "@/components/AccountBlock";

interface ExplorerRailProps {
  spaces: DashSpace[];
  terminals: DashTerminal[];
  toolCount: number;
  userEmail: string;
  userName: string;
  isPlatformAdmin: boolean;
  canCreateSpace: boolean;
}

/**
 * The left-rail Explorer. A two-level tree: space → its terminals. Each
 * terminal link takes you to the terminal's detail page. At the bottom:
 *   - a subtle `🛠 N tools` pill to /tools
 *   - the AccountBlock dropdown — see component for the full menu surface
 */
export function ExplorerRail({
  spaces,
  terminals,
  toolCount,
  userEmail,
  userName,
  isPlatformAdmin,
  canCreateSpace,
}: ExplorerRailProps) {
  const terminalsBySpace = useMemo(() => {
    const m = new Map<string, DashTerminal[]>();
    for (const t of terminals) {
      if (!m.has(t.space_id)) m.set(t.space_id, []);
      m.get(t.space_id)!.push(t);
    }
    return m;
  }, [terminals]);

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="flex h-full flex-col bg-bg-0">
      <div className="flex h-9 flex-shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-3">
          Explorer
        </span>
        {canCreateSpace ? (
          <Link
            href="/?new=space"
            aria-label="New space"
            className="rounded-sm p-1 text-text-3 hover:bg-bg-2 hover:text-text-0"
            title="New space (admin)"
          >
            <Plus className="h-3 w-3" />
          </Link>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto px-1 py-2">
        {spaces.length === 0 ? (
          <p className="px-3 py-4 text-xs text-text-3">
            You&apos;re not in any spaces yet.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {spaces.map((s) => {
              const children = terminalsBySpace.get(s.id) ?? [];
              const isCollapsed = collapsed.has(s.id);
              const canMakeTerminal = s.role === "owner" || s.role === "admin";
              return (
                <li key={s.id}>
                  <div className="group flex items-center gap-1 rounded-sm px-2 py-1 hover:bg-bg-2">
                    <button
                      onClick={() => toggle(s.id)}
                      aria-label={isCollapsed ? "Expand" : "Collapse"}
                      className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-text-3 hover:text-text-0"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </button>
                    <Building2
                      className="h-3.5 w-3.5 flex-shrink-0 text-text-3"
                      aria-hidden="true"
                    />
                    <span className="flex-1 truncate text-text-1">{s.name}</span>
                    {canMakeTerminal ? (
                      <>
                        <Link
                          href={`/s/${s.slug}/settings`}
                          aria-label={`Settings for ${s.name}`}
                          title="Space settings"
                          className="rounded-sm p-0.5 text-text-3 opacity-0 transition-opacity hover:bg-bg-3 hover:text-text-0 group-hover:opacity-100"
                        >
                          <Settings className="h-3 w-3" />
                        </Link>
                        <Link
                          href={`/?new=terminal&space=${s.slug}`}
                          aria-label="New terminal"
                          className="rounded-sm p-0.5 text-text-3 opacity-0 transition-opacity hover:bg-bg-3 hover:text-text-0 group-hover:opacity-100"
                        >
                          <Plus className="h-3 w-3" />
                        </Link>
                      </>
                    ) : null}
                  </div>
                  {!isCollapsed ? (
                    <ul className="mt-0.5 space-y-0.5">
                      {children.length === 0 ? (
                        <li className="px-8 text-[11px] text-text-3">
                          No terminals yet.
                        </li>
                      ) : (
                        children.map((t) => (
                          <li key={t.id}>
                            <Link
                              href={`/p/${t.ticker}`}
                              className="flex items-center gap-2 rounded-sm py-0.5 pl-8 pr-2 text-text-1 hover:bg-bg-2 hover:text-text-0"
                            >
                              <span className="font-mono text-[10px] text-text-3">
                                {t.ticker}
                              </span>
                              <span className="flex-1 truncate text-xs">
                                {t.name}
                              </span>
                            </Link>
                          </li>
                        ))
                      )}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-4 px-2">
          <Link
            href="/tools"
            className="flex items-center gap-2 rounded-sm px-2 py-1 text-xs text-text-2 hover:bg-bg-2 hover:text-text-0"
          >
            <Sparkles className="h-3 w-3 text-accent" />
            <span className="flex-1">Tools</span>
            <span className="font-mono text-[10px] text-text-3">
              {toolCount}
            </span>
          </Link>
        </div>
      </div>

      <AccountBlock
        name={userName}
        email={userEmail}
        isPlatformAdmin={isPlatformAdmin}
      />
    </div>
  );
}
