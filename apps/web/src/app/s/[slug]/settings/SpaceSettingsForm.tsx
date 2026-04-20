"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, UserMinus, UserPlus, Mail } from "lucide-react";
import { Avatar } from "@/components/primitives";
import { cn } from "@/lib/utils";

type SpaceRole = "owner" | "admin" | "member";

export interface SpaceMember {
  user_id: string;
  role: SpaceRole;
  joined_at: string;
  full_name: string | null;
  is_you: boolean;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: SpaceRole;
  invited_at: string;
  expires_at: string;
}

const ROLES: SpaceRole[] = ["owner", "admin", "member"];

/**
 * Space settings — identity + members + invites. Mirrors the terminal
 * settings layout so the two feel like siblings.
 */
export function SpaceSettingsForm({
  initial,
  members: initialMembers,
  pendingInvites: initialInvites,
  canManage,
  myRole,
  myUserId,
}: {
  initial: { slug: string; name: string };
  members: SpaceMember[];
  pendingInvites: PendingInvite[];
  canManage: boolean;
  myRole: SpaceRole;
  myUserId: string;
}) {
  const router = useRouter();
  const [members, setMembers] = useState<SpaceMember[]>(initialMembers);
  const [invites, setInvites] = useState<PendingInvite[]>(initialInvites);
  // Kept in state so rename doesn't break the routes the form posts to.
  const [slug, setSlug] = useState(initial.slug);

  return (
    <div className="flex flex-col gap-5">
      <IdentityCard
        slug={slug}
        initial={initial}
        canManage={canManage}
        onRenamed={(nextSlug) => {
          setSlug(nextSlug);
          router.push(`/s/${nextSlug}/settings`);
          router.refresh();
        }}
        onSaved={() => router.refresh()}
      />
      <MembersCard
        slug={slug}
        members={members}
        canManage={canManage}
        myRole={myRole}
        myUserId={myUserId}
        onChange={setMembers}
      />
      <InvitesCard
        slug={slug}
        invites={invites}
        canManage={canManage}
        onAdd={(invite) => setInvites((prev) => [invite, ...prev])}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function IdentityCard({
  slug,
  initial,
  canManage,
  onRenamed,
  onSaved,
}: {
  slug: string;
  initial: { slug: string; name: string };
  canManage: boolean;
  onRenamed: (slug: string) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [nextSlug, setNextSlug] = useState(initial.slug);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setSaving(true);
    setError(null);
    try {
      const patch: Record<string, string> = {};
      if (name.trim() !== initial.name) patch.name = name.trim();
      if (nextSlug.trim() !== initial.slug) patch.slug = nextSlug.trim();
      if (Object.keys(patch).length === 0) {
        setSaving(false);
        return;
      }
      const r = await fetch(`/api/v1/orgs/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(patch),
      });
      if (!r.ok) {
        setError(await messageOf(r));
        return;
      }
      const body = (await r.json()) as {
        data?: { slug: string; name: string };
      };
      setSavedAt(Date.now());
      if (body.data?.slug && body.data.slug !== slug) {
        onRenamed(body.data.slug);
      } else {
        onSaved();
      }
    } finally {
      setSaving(false);
    }
  }

  const dirty =
    name.trim() !== initial.name || nextSlug.trim() !== initial.slug;

  return (
    <Card title="Identity">
      <form onSubmit={submit} className="flex flex-col gap-3 px-4 py-3">
        <LabelledInput
          label="Name"
          value={name}
          onChange={setName}
          disabled={!canManage}
          maxLength={120}
        />
        <LabelledInput
          label="Slug"
          value={nextSlug}
          onChange={(v) => setNextSlug(v.toLowerCase())}
          disabled={!canManage}
          maxLength={40}
          hint={`Currently /s/${initial.slug} — renaming breaks existing URLs.`}
        />
        <Footer
          saving={saving}
          savedAt={savedAt}
          error={error}
          canSubmit={canManage && dirty}
        />
      </form>
    </Card>
  );
}

function MembersCard({
  slug,
  members,
  canManage,
  myRole,
  myUserId,
  onChange,
}: {
  slug: string;
  members: SpaceMember[];
  canManage: boolean;
  myRole: SpaceRole;
  myUserId: string;
  onChange: (next: SpaceMember[]) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  async function setRole(userId: string, role: SpaceRole) {
    setError(null);
    const r = await fetch(
      `/api/v1/orgs/${slug}/members/${userId}`,
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
    const self = userId === myUserId;
    if (
      !confirm(
        self
          ? "Leave this space? You'll lose access to every terminal inside it."
          : "Remove this person from the space? They'll lose access to all terminals here.",
      )
    )
      return;
    const r = await fetch(`/api/v1/orgs/${slug}/members/${userId}`, {
      method: "DELETE",
      credentials: "include",
    });
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
        {members.map((m) => {
          // Non-owners can't change owner roles. Admins can't promote to owner.
          const roleLocked =
            !canManage ||
            (myRole !== "owner" && m.role === "owner") ||
            (myRole === "admin" && m.is_you === false);
          return (
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
                  Joined {new Date(m.joined_at).toLocaleDateString()}
                </span>
              </span>
              <select
                value={m.role}
                onChange={(e) =>
                  void setRole(m.user_id, e.target.value as SpaceRole)
                }
                disabled={roleLocked}
                aria-label={`Role for ${m.full_name ?? "member"}`}
                className={cn(
                  "rounded-sm border border-border bg-bg-2 px-2 py-1 font-mono text-[11px] uppercase text-text-1 outline-none focus:border-border-focus",
                  roleLocked && "cursor-not-allowed opacity-50",
                )}
              >
                {ROLES.filter((r) =>
                  myRole === "owner" ? true : r !== "owner",
                ).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              {canManage || m.is_you ? (
                <button
                  type="button"
                  onClick={() => void remove(m.user_id)}
                  aria-label={m.is_you ? "Leave space" : "Remove member"}
                  className="rounded p-1 text-text-3 hover:bg-bg-3 hover:text-danger"
                >
                  <UserMinus className="h-4 w-4" />
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {error ? (
        <p className="border-t border-border bg-danger-subtle px-4 py-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </Card>
  );
}

function InvitesCard({
  slug,
  invites,
  canManage,
  onAdd,
}: {
  slug: string;
  invites: PendingInvite[];
  canManage: boolean;
  onAdd: (invite: PendingInvite) => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<SpaceRole>("member");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const r = await fetch(`/api/v1/orgs/${slug}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim(), role }),
      });
      if (!r.ok) {
        setError(await messageOf(r));
        return;
      }
      const body = (await r.json()) as {
        data?: {
          invited?: boolean;
          added?: boolean;
          user_id?: string;
          email?: string;
          role?: SpaceRole;
        };
      };
      if (body.data?.invited) {
        setSuccess(`Invite sent to ${email}. They'll get a magic link.`);
        onAdd({
          id: `pending-${Date.now()}`,
          email,
          role,
          invited_at: new Date().toISOString(),
          expires_at: new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        });
      } else if (body.data?.added) {
        setSuccess(`${email} was already a Rokki user — added directly.`);
      }
      setEmail("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Invitations" subtitle={`${invites.length} pending`}>
      {canManage ? (
        <form
          onSubmit={submit}
          className="flex flex-col gap-2 border-b border-border px-4 py-3 md:flex-row md:items-end"
        >
          <label className="flex-1">
            <span className="block text-[10px] uppercase tracking-wide text-text-3">
              Email
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="person@example.com"
              className="mt-1 w-full rounded-sm border border-border bg-bg-0 px-3 py-1.5 text-sm text-text-0 outline-none focus:border-border-focus"
            />
          </label>
          <label>
            <span className="block text-[10px] uppercase tracking-wide text-text-3">
              Role
            </span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as SpaceRole)}
              className="mt-1 rounded-sm border border-border bg-bg-2 px-2 py-1.5 font-mono text-[11px] uppercase text-text-1 outline-none focus:border-border-focus"
            >
              {ROLES.filter((r) => r !== "owner").map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={!email || saving}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-sm border border-border bg-bg-3 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-text-0 hover:bg-bg-4",
              (!email || saving) && "cursor-not-allowed opacity-50",
            )}
          >
            <UserPlus className="h-3 w-3" />
            {saving ? "Sending…" : "Invite"}
          </button>
        </form>
      ) : null}
      {success ? (
        <p className="flex items-center gap-1 border-b border-border bg-success-subtle px-4 py-1.5 text-xs text-success">
          <Check className="h-3 w-3" /> {success}
        </p>
      ) : null}
      {error ? (
        <p className="border-b border-border bg-danger-subtle px-4 py-1.5 text-xs text-danger">
          {error}
        </p>
      ) : null}
      {invites.length === 0 ? (
        <p className="px-4 py-3 text-xs text-text-3">
          No pending invitations.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {invites.map((i) => (
            <li
              key={i.id}
              className="flex items-center gap-3 px-4 py-2 text-sm"
            >
              <Mail className="h-4 w-4 text-text-3" />
              <span className="flex-1 truncate text-text-1">{i.email}</span>
              <span className="font-mono text-[11px] uppercase text-text-3">
                {i.role}
              </span>
              <span className="text-[11px] text-text-3">
                expires{" "}
                {new Date(i.expires_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Building blocks (local; mirror TerminalSettingsForm but standalone so each
// page is self-contained).

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
        {subtitle ? (
          <span className="normal-case text-text-3">{subtitle}</span>
        ) : null}
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
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  maxLength?: number;
  hint?: string;
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
      {hint ? (
        <span className="text-[10px] text-text-3">{hint}</span>
      ) : null}
    </label>
  );
}

function Footer({
  saving,
  savedAt,
  error,
  canSubmit,
}: {
  saving: boolean;
  savedAt: number | null;
  error: string | null;
  canSubmit: boolean;
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
    </footer>
  );
}

async function messageOf(r: Response): Promise<string> {
  try {
    const body = (await r.json()) as { errors?: { message: string }[] };
    return body.errors?.[0]?.message ?? `HTTP ${r.status}`;
  } catch {
    return `HTTP ${r.status}`;
  }
}
