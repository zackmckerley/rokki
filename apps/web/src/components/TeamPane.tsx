"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mail, UserPlus, Clock, Circle, Users as UsersIcon } from "lucide-react";
import { Dialog } from "./Dialog";
import { EmptyState } from "./EmptyState";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeTable } from "@/lib/supabase/realtime";
import { useRegisterCommands } from "@/lib/use-register-commands";
import { currentTimeIn, shortZoneLabel } from "@/lib/timezone";
import { setDragPayload } from "@/lib/drag-drop";
import { HelpTip } from "./HelpTip";
import type { ProjectRole } from "@rokki/db";

interface MemberProfile {
  full_name: string | null;
  avatar_url: string | null;
  timezone: string | null;
}

interface Member {
  user_id: string;
  role: ProjectRole;
  added_at: string;
  profiles: MemberProfile | null;
}

interface PendingInvite {
  id: string;
  email: string;
  role: ProjectRole;
  invited_at: string;
  expires_at: string;
}

interface TeamPaneProps {
  ticker: string;
  projectId: string;
  canInvite: boolean;
}

/**
 * Universal Team pane — same flow whether this is a construction project,
 * a legal matter, or a family household. Invite by email, pick a role,
 * Rokki sends a magic-link that auto-accepts on click. Live presence shows
 * who is currently viewing the space.
 */
export function TeamPane({ ticker, projectId, canInvite }: TeamPaneProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/v1/projects/${ticker}/members`, {
        credentials: "include",
      });
      const body = (await r.json()) as {
        data?: { members: Member[]; pending_invites: PendingInvite[] };
      };
      if (body.data) {
        setMembers(body.data.members);
        setInvites(body.data.pending_invites);
      }
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime — mirror membership + invite changes from the DB.
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleReload = useCallback(() => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => {
      reloadTimer.current = null;
      void load();
    }, 250);
  }, [load]);
  useRealtimeTable<Record<string, unknown>>(
    {
      table: "project_members",
      filter: `terminal_id=eq.${projectId}`,
      channelKey: `members:${projectId}`,
    },
    { onInsert: scheduleReload, onUpdate: scheduleReload, onDelete: scheduleReload },
  );
  useRealtimeTable<Record<string, unknown>>(
    {
      table: "invites",
      filter: `terminal_id=eq.${projectId}`,
      channelKey: `invites:${projectId}`,
    },
    { onInsert: scheduleReload, onUpdate: scheduleReload, onDelete: scheduleReload },
  );

  // Presence — broadcast our own user id and listen for others in the same
  // space. Lightweight heartbeat; Supabase handles expiry when a tab closes.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const me = data.user?.id;
      if (!me || cancelled) return;
      channel = supabase.channel(`presence:${projectId}`, {
        config: { presence: { key: me } },
      });
      channel.on("presence", { event: "sync" }, () => {
        if (!channel) return;
        const state = channel.presenceState() as Record<string, unknown[]>;
        setOnlineUserIds(new Set(Object.keys(state)));
      });
      await channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED" && channel) {
          await channel.track({ user_id: me, at: new Date().toISOString() });
        }
      });
    })();
    return () => {
      cancelled = true;
      if (channel) {
        void channel.unsubscribe();
        void createClient().removeChannel(channel);
      }
    };
  }, [projectId]);

  const onlineCount = useMemo(
    () => members.filter((m) => onlineUserIds.has(m.user_id)).length,
    [members, onlineUserIds],
  );

  const paletteCommands = useMemo(
    () =>
      canInvite
        ? [
            {
              id: `team/invite:${projectId}`,
              title: "Invite someone",
              category: "action" as const,
              icon: <UserPlus className="h-3.5 w-3.5" />,
              shortcut: "I",
              onRun: () => setInviteOpen(true),
            },
          ]
        : [],
    [canInvite, projectId],
  );
  useRegisterCommands(`team:${projectId}`, paletteCommands);

  // `I` opens invite dialog
  useEffect(() => {
    if (!canInvite) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
      if (e.key === "i" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setInviteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canInvite]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <HelpTip term="terminal-role">
            <h2 className="text-sm font-semibold text-text-0">Team</h2>
          </HelpTip>
          <span className="font-mono text-xs text-text-3">
            {members.length} member{members.length === 1 ? "" : "s"}
            {invites.length > 0 ? ` · ${invites.length} pending` : ""}
            {onlineCount > 0 ? (
              <span className="ml-2 inline-flex items-center gap-1 text-success">
                <Circle
                  className="h-1.5 w-1.5 fill-current"
                  aria-hidden="true"
                />
                {onlineCount} online
              </span>
            ) : null}
          </span>
        </div>
        {canInvite ? (
          <button
            onClick={() => setInviteOpen(true)}
            className="flex items-center gap-1 rounded-sm px-2 py-1 text-xs text-text-2 hover:bg-bg-2 hover:text-text-0"
          >
            <UserPlus className="h-3 w-3" /> Invite
            <kbd className="ml-1 font-mono text-[10px] text-text-3">I</kbd>
          </button>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <Skeleton />
        ) : (
          <>
            {members.length === 0 && invites.length === 0 ? (
              <Empty canInvite={canInvite} onInvite={() => setInviteOpen(true)} />
            ) : null}

            {members.length > 0 ? (
              <section>
                <SectionHeader>Members</SectionHeader>
                <ul className="divide-y divide-border">
                  {members.map((m) => (
                    <MemberRow
                      key={m.user_id}
                      member={m}
                      online={onlineUserIds.has(m.user_id)}
                    />
                  ))}
                </ul>
              </section>
            ) : null}

            {invites.length > 0 ? (
              <section>
                <SectionHeader>Pending invites</SectionHeader>
                <ul className="divide-y divide-border">
                  {invites.map((inv) => (
                    <InviteRow key={inv.id} invite={inv} />
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </div>

      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        ticker={ticker}
        onInvited={() => {
          setInviteOpen(false);
          void load();
        }}
      />
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="border-b border-border bg-bg-1 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-text-3">
      {children}
    </h3>
  );
}

function MemberRow({ member, online }: { member: Member; online: boolean }) {
  const name = member.profiles?.full_name ?? "—";
  const tz = member.profiles?.timezone ?? null;
  const timeStr = tz ? currentTimeIn(tz) : null;
  const cityStr = tz ? shortZoneLabel(tz) : null;
  const [dragging, setDragging] = useState(false);
  return (
    <li
      draggable
      title="Drag onto a task to assign"
      onDragStart={(e) => {
        setDragPayload(e.dataTransfer, "user", member.user_id, name);
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      className={cn(
        "flex items-center gap-3 px-4 py-2.5",
        dragging && "opacity-50",
      )}
    >
      <SharedAvatar name={name} size="sm" online={online} />
      <div className="flex flex-1 flex-col min-w-0">
        <span className="truncate text-sm text-text-0">{name}</span>
        {timeStr && cityStr ? (
          <span className="truncate font-mono text-[10px] text-text-3">
            {timeStr} · {cityStr}
          </span>
        ) : null}
      </div>
      {online ? (
        <span className="font-mono text-[10px] uppercase tracking-wide text-success">
          online
        </span>
      ) : null}
      <RolePill role={member.role} />
    </li>
  );
}

function InviteRow({ invite }: { invite: PendingInvite }) {
  const expiresSoon =
    new Date(invite.expires_at).getTime() - Date.now() < 2 * 86400 * 1000;
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <Mail className="h-3.5 w-3.5 flex-shrink-0 text-text-3" aria-hidden="true" />
      <span className="flex-1 truncate text-sm text-text-1">{invite.email}</span>
      <span
        className={cn(
          "flex items-center gap-1 font-mono text-[11px]",
          expiresSoon ? "text-warning" : "text-text-3",
        )}
      >
        <Clock className="h-2.5 w-2.5" /> pending
      </span>
      <RolePill role={invite.role} />
    </li>
  );
}

// Using the shared Avatar primitive for consistent initials, sizing, and
// the optional online halo. Keeping the file-local re-export so callers
// above don't need to change their JSX.
import { Avatar as SharedAvatar } from "./primitives";
function Avatar({ name }: { name: string }) {
  return <SharedAvatar name={name} size="sm" />;
}

function RolePill({ role }: { role: ProjectRole }) {
  return (
    <span className="rounded-sm bg-bg-3 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-text-2">
      {role}
    </span>
  );
}

function Empty({
  canInvite,
  onInvite,
}: {
  canInvite: boolean;
  onInvite: () => void;
}) {
  return (
    <EmptyState
      icon={UsersIcon}
      title="No one else is here yet."
      body={
        canInvite
          ? "Invite a teammate or guest by email — they get a magic link that auto-accepts."
          : "An owner or manager will need to add people to this terminal."
      }
      action={
        canInvite
          ? {
              label: "+ Invite team",
              onClick: onInvite,
              variant: "accent",
              shortcut: "I",
            }
          : undefined
      }
      className="p-10"
    />
  );
}

function Skeleton() {
  return (
    <ul className="divide-y divide-border">
      {[0, 1].map((i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-2.5">
          <span className="h-7 w-7 rounded-full bg-bg-3" />
          <span className="h-3 flex-1 rounded-sm bg-bg-3" />
        </li>
      ))}
    </ul>
  );
}

function InviteDialog({
  open,
  onClose,
  ticker,
  onInvited,
}: {
  open: boolean;
  onClose: () => void;
  ticker: string;
  onInvited: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ProjectRole>("guest");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!open) {
      setEmail("");
      setRole("guest");
      setError("");
      setSuccess("");
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    const r = await fetch(`/api/v1/projects/${ticker}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), role }),
      credentials: "include",
    });
    const body = (await r.json()) as {
      data?: { invited?: boolean; added?: boolean };
      errors?: { message: string }[];
    };
    if (!r.ok) {
      setError(body.errors?.[0]?.message ?? "Failed to invite");
      setLoading(false);
      return;
    }
    setLoading(false);
    if (body.data?.added) {
      setSuccess("Added to the team.");
    } else {
      setSuccess("Invite sent. They'll get a magic-link email.");
    }
    setTimeout(onInvited, 900);
  }

  return (
    <Dialog open={open} onClose={onClose} title="Invite someone">
      <form onSubmit={submit} className="space-y-3">
        <Input
          name="email"
          type="email"
          label="Email"
          placeholder="maria@example.com"
          autoFocus
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={error || undefined}
        />
        <div className="flex flex-col gap-1">
          <HelpTip term="terminal-role">
            <label className="text-xs font-medium text-text-1">Role</label>
          </HelpTip>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as ProjectRole)}
            className="h-9 rounded border border-border bg-bg-2 px-3 text-sm text-text-0 focus:border-border-focus focus:outline-none"
          >
            <option value="owner">Owner — full control</option>
            <option value="manager">Manager — team + settings</option>
            <option value="guest">Guest — scoped access</option>
          </select>
        </div>

        {success ? (
          <p className="text-xs text-success">{success}</p>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="accent" loading={loading}>
            Send invite
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
