"use client";

import { ShieldCheck, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import type { SpaceMemberRow } from "@/lib/space-queries";

interface SpaceMembersCardProps {
  members: SpaceMemberRow[];
}

const ROLE_BADGE: Record<SpaceMemberRow["role"], string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

/**
 * Item #4 — directory of every space member with role,
 * terminal-membership count, and active-task count. Power version
 * of "who's involved" plus enough signal to spot loaded vs.
 * idle members.
 *
 * Owners get a star; admins get a shield. Both render before
 * regular members. Initials avatar matches AccountBlock so the
 * visual identity is consistent across the app.
 */
export function SpaceMembersCard({ members }: SpaceMembersCardProps) {
  const sorted = [...members].sort((a, b) => {
    const rank: Record<SpaceMemberRow["role"], number> = {
      owner: 0,
      admin: 1,
      member: 2,
    };
    return rank[a.role] - rank[b.role];
  });

  return (
    <DashboardCard
      title="Members"
      count={members.length}
      expandHref={null}
    >
      {sorted.length === 0 ? (
        <p className="px-3 py-4 text-center text-[11px] text-text-3">
          No members yet.
        </p>
      ) : (
        <ul className="divide-y divide-border/40">
          {sorted.map((m) => (
            <li
              key={m.user_id}
              className="flex items-center gap-2 px-3 py-1.5"
            >
              <Avatar name={m.full_name ?? m.email ?? "—"} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 text-xs text-text-0">
                  <span className="truncate">
                    {m.full_name ?? m.email ?? "—"}
                  </span>
                  {m.role === "owner" ? (
                    <Star
                      className="h-2.5 w-2.5 flex-shrink-0 text-accent"
                      aria-label="owner"
                    />
                  ) : null}
                  {m.role === "admin" ? (
                    <ShieldCheck
                      className="h-2.5 w-2.5 flex-shrink-0 text-accent"
                      aria-label="admin"
                    />
                  ) : null}
                </div>
                <div className="truncate font-mono text-[10px] text-text-3">
                  {ROLE_BADGE[m.role]}
                  {" · "}
                  {m.terminal_count} terminal
                  {m.terminal_count === 1 ? "" : "s"}
                </div>
              </div>
              <span
                className={cn(
                  "rounded-sm bg-bg-3 px-1 font-mono text-[10px]",
                  m.active_task_count > 0 ? "text-text-1" : "text-text-3",
                )}
                title={`${m.active_task_count} active task${
                  m.active_task_count === 1 ? "" : "s"
                }`}
              >
                {m.active_task_count}
              </span>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}

function Avatar({ name }: { name: string }) {
  const initials =
    name
      .split(/\s+/)
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";
  return (
    <span
      className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-bg-3 text-[10px] font-semibold text-text-0"
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
