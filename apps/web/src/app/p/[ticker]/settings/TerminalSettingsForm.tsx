"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, UserMinus, Check, AlertTriangle } from "lucide-react";
import { Avatar } from "@/components/primitives";
import { RichTextarea } from "@/components/ui/RichTextarea";
import { cn } from "@/lib/utils";
import type { ProjectStatus, ProjectRole } from "@rokki/db";

export interface TerminalMember {
  user_id: string;
  role: ProjectRole;
  added_at: string;
  full_name: string | null;
  avatar_url: string | null;
  is_you: boolean;
}

interface Initial {
  ticker: string;
  name: string;
  description: string;
  status: ProjectStatus;
  archived: boolean;
}

const STATUSES: ProjectStatus[] = [
  "planning",
  "active",
  "blocked",
  "done",
  "archived",
];

const ROLES: ProjectRole[] = [
  "owner",
  "manager",
  "architect",
  "gc",
  "lender",
  "family",
  "guest",
];

/**
 * Terminal settings — client form. One card per concern:
 *   1. Identity (name, description)
 *   2. Status
 *   3. Members + roles
 *   4. Danger (archive)
 *
 * Each card owns its own save/error state so a failed archive doesn't blow
 * away in-flight name edits.
 */
export function TerminalSettingsForm({
  initial,
  members: initialMembers,
  canManage,
  myUserId,
}: {
  initial: Initial;
  members: TerminalMember[];
  canManage: boolean;
  myUserId: string;
}) {
  const router = useRouter();
  const [members, setMembers] = useState<TerminalMember[]>(initialMembers);

  return (
    <div className="flex flex-col gap-5">
      <IdentityCard
        initial={initial}
        canManage={canManage}
        onSaved={() => router.refresh()}
      />
      <StatusCard
        ticker={initial.ticker}
        status={initial.status}
        archived={initial.archived}
        canManage={canManage}
        onSaved={() => router.refresh()}
      />
      <MembersCard
        ticker={initial.ticker}
        members={members}
        canManage={canManage}
        myUserId={myUserId}
        onChange={setMembers}
      />
      <DangerCard
        ticker={initial.ticker}
        archived={initial.archived}
        canManage={canManage}
        onArchived={() => router.push("/")}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function IdentityCard({
  initial,
  canManage,
  onSaved,
}: {
  initial: Initial;
  canManage: boolean;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const { saving, savedAt, error, save } = useAutoSave();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    await save(async () => {
      const r = await fetch(`/api/v1/projects/${initial.ticker}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });
      if (!r.ok) throw await toError(r);
    });
    onSaved();
  }

  const dirty =
    name.trim() !== initial.name || description.trim() !== initial.description;

  return (
    <Card title="Identity">
      <form onSubmit={submit} className="flex flex-col gap-3 px-4 py-3">
        <LabelledInput
          label="Name"
          value={name}
          onChange={setName}
          disabled={!canManage}
          maxLength={200}
        />
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-text-3">
            Description
          </span>
          <RichTextarea
            value={description}
            onChange={setDescription}
            disabled={!canManage}
            maxLength={2000}
            minHeight={96}
            ariaLabel="Terminal description"
            undoContext="terminal description"
            placeholder="Markdown supported. Type / for blocks."
          />
          <span className="text-[10px] text-text-3">
            Markdown supported — preview with the eye icon.
          </span>
        </label>
        <FormFooter
          saving={saving}
          savedAt={savedAt}
          error={error}
          canSubmit={canManage && dirty}
        />
      </form>
    </Card>
  );
}

function StatusCard({
  ticker,
  status,
  archived,
  canManage,
  onSaved,
}: {
  ticker: string;
  status: ProjectStatus;
  archived: boolean;
  canManage: boolean;
  onSaved: () => void;
}) {
  const [current, setCurrent] = useState<ProjectStatus>(status);
  const { saving, savedAt, error, save } = useAutoSave();

  async function choose(next: ProjectStatus) {
    if (!canManage || next === current || archived) return;
    setCurrent(next);
    await save(async () => {
      const r = await fetch(`/api/v1/projects/${ticker}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: next }),
      });
      if (!r.ok) throw await toError(r);
    });
    onSaved();
  }

  return (
    <Card title="Status">
      <div className="flex flex-wrap gap-1.5 px-4 py-3">
        {STATUSES.filter((s) => s !== "archived").map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => void choose(s)}
            disabled={!canManage || archived}
            aria-pressed={current === s}
            className={cn(
              "rounded-sm border px-2.5 py-1 font-mono text-xs uppercase tracking-wide transition-colors",
              current === s
                ? "border-accent bg-accent-subtle text-text-0"
                : "border-border bg-bg-2 text-text-2 hover:bg-bg-3",
              (!canManage || archived) && "cursor-not-allowed opacity-50",
            )}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="border-t border-border bg-bg-2 px-4 py-1.5">
        <FormFooter saving={saving} savedAt={savedAt} error={error} />
      </div>
    </Card>
  );
}

function MembersCard({
  ticker,
  members,
  canManage,
  myUserId,
  onChange,
}: {
  ticker: string;
  members: TerminalMember[];
  canManage: boolean;
  myUserId: string;
  onChange: (next: TerminalMember[]) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  async function setRole(userId: string, role: ProjectRole) {
    setError(null);
    const r = await fetch(
      `/api/v1/projects/${ticker}/members/${userId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role }),
      },
    );
    if (!r.ok) {
      setError(await messageOf(r));
      return;
    }
    onChange(members.map((m) => (m.user_id === userId ? { ...m, role } : m)));
  }

  async function remove(userId: string) {
    setError(null);
    if (
      !confirm(
        userId === myUserId
          ? "Leave this terminal? You'll lose access to its tasks and files."
          : "Remove this member from the terminal?",
      )
    )
      return;
    const r = await fetch(
      `/api/v1/projects/${ticker}/members/${userId}`,
      {
        method: "DELETE",
        credentials: "include",
      },
    );
    if (!r.ok) {
      setError(await messageOf(r));
      return;
    }
    onChange(members.filter((m) => m.user_id !== userId));
  }

  return (
    <Card
      title="Members"
      subtitle={`${members.length} ${members.length === 1 ? "person" : "people"}`}
    >
      <ul className="divide-y divide-border">
        {members.map((m) => (
          <li
            key={m.user_id}
            className="flex items-center gap-3 px-4 py-2.5 text-sm"
          >
            <Avatar name={m.full_name ?? ""} size="md" />
            <span className="flex-1 truncate">
              <span className="block text-text-0">
                {m.full_name ?? m.user_id.slice(0, 8)}
                {m.is_you ? (
                  <span className="ml-2 text-[10px] uppercase text-text-3">
                    (you)
                  </span>
                ) : null}
              </span>
              <span className="block text-[11px] text-text-3">
                Joined {new Date(m.added_at).toLocaleDateString()}
              </span>
            </span>
            <select
              value={m.role}
              onChange={(e) => void setRole(m.user_id, e.target.value as ProjectRole)}
              disabled={!canManage && !m.is_you}
              aria-label={`Role for ${m.full_name ?? "member"}`}
              className={cn(
                "rounded-sm border border-border bg-bg-2 px-2 py-1 font-mono text-[11px] uppercase text-text-1 outline-none focus:border-border-focus",
                !canManage && "cursor-not-allowed opacity-50",
              )}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {canManage || m.is_you ? (
              <button
                type="button"
                onClick={() => void remove(m.user_id)}
                aria-label={m.is_you ? "Leave terminal" : "Remove member"}
                className="rounded p-1 text-text-3 hover:bg-bg-3 hover:text-danger"
              >
                <UserMinus className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {error ? (
        <p className="border-t border-border bg-danger-subtle px-4 py-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
      <div className="border-t border-border bg-bg-2 px-4 py-2 text-[11px] text-text-3">
        To invite someone, go to the terminal&apos;s Team pane (F7) — this page
        only edits existing members.
      </div>
    </Card>
  );
}

function DangerCard({
  ticker,
  archived,
  canManage,
  onArchived,
}: {
  ticker: string;
  archived: boolean;
  canManage: boolean;
  onArchived: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function archive() {
    setError(null);
    if (
      !confirm(
        "Archive this terminal? Tasks, files, and messages are preserved — but it disappears from lists and nobody can post new activity. A platform admin can restore it.",
      )
    )
      return;
    setBusy(true);
    try {
      const r = await fetch(`/api/v1/projects/${ticker}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) {
        setError(await messageOf(r));
        return;
      }
      onArchived();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Danger zone">
      <div className="flex items-start gap-3 px-4 py-3">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-danger" />
        <div className="flex-1 text-sm">
          <p className="text-text-0">Archive terminal</p>
          <p className="mt-0.5 text-xs text-text-3">
            Hides it from lists and locks it from new activity. History is
            preserved.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void archive()}
          disabled={!canManage || archived || busy}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-sm border border-danger/40 bg-danger-subtle px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-danger hover:bg-danger/20",
            (!canManage || archived || busy) && "cursor-not-allowed opacity-50",
          )}
        >
          <Archive className="h-3 w-3" />
          {archived ? "Archived" : busy ? "Archiving…" : "Archive"}
        </button>
      </div>
      {error ? (
        <p className="border-t border-border bg-danger-subtle px-4 py-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Building blocks

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded border border-border bg-bg-1">
      <header className="flex items-center justify-between border-b border-border bg-bg-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-3">
        <span>{title}</span>
        {subtitle ? <span className="normal-case text-text-3">{subtitle}</span> : null}
      </header>
      {children}
    </section>
  );
}

function LabelledInput({
  label,
  value,
  onChange,
  disabled,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  maxLength?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-text-3">
        {label}
      </span>
      <input
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn(
          "rounded-sm border border-border bg-bg-0 px-3 py-1.5 text-sm text-text-0 outline-none focus:border-border-focus",
          disabled && "cursor-not-allowed opacity-60",
        )}
      />
    </label>
  );
}

function FormFooter({
  saving,
  savedAt,
  error,
  canSubmit,
}: {
  saving: boolean;
  savedAt: number | null;
  error: string | null;
  canSubmit?: boolean;
}) {
  return (
    <footer className="flex h-5 items-center justify-between">
      <span className="text-xs">
        {error ? (
          <span className="text-danger">{error}</span>
        ) : savedAt ? (
          <span className="inline-flex items-center gap-1 text-success">
            <Check className="h-3 w-3" /> Saved
          </span>
        ) : saving ? (
          <span className="text-text-3">Saving…</span>
        ) : null}
      </span>
      {canSubmit !== undefined ? (
        <button
          type="submit"
          disabled={!canSubmit || saving}
          className={cn(
            "rounded-sm border border-border bg-bg-3 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-text-0 hover:bg-bg-4",
            (!canSubmit || saving) && "cursor-not-allowed opacity-50",
          )}
        >
          Save
        </button>
      ) : null}
    </footer>
  );
}

function useAutoSave() {
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(fn: () => Promise<void>) {
    setSaving(true);
    setError(null);
    try {
      await fn();
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return { saving, savedAt, error, save };
}

async function toError(r: Response): Promise<Error> {
  try {
    const body = (await r.json()) as { errors?: { message: string }[] };
    return new Error(body.errors?.[0]?.message ?? `HTTP ${r.status}`);
  } catch {
    return new Error(`HTTP ${r.status}`);
  }
}

async function messageOf(r: Response): Promise<string> {
  try {
    const body = (await r.json()) as { errors?: { message: string }[] };
    return body.errors?.[0]?.message ?? `HTTP ${r.status}`;
  } catch {
    return `HTTP ${r.status}`;
  }
}
