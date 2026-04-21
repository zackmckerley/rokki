"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  ShieldOff,
  Power,
  Trash2,
  Mail,
  KeyRound,
  PauseCircle,
  PlayCircle,
  Plus,
  X,
  StickyNote,
  AlertCircle,
  Check,
} from "lucide-react";
import {
  AdminBadge,
  AdminButton,
  AdminPanel,
  AdminTable,
  AdminTd,
  AdminTh,
  AdminEmpty,
} from "@/components/admin/primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SpacePicker, type PickedSpace } from "@/components/admin/SpacePicker";
import { cn } from "@/lib/utils";

type SpaceRole = "owner" | "admin" | "member";

export interface AdminUserDetailData {
  user: {
    id: string;
    email: string;
    created_at: string;
    last_sign_in_at: string | null;
    email_confirmed_at: string | null;
    banned_until: string | null;
  };
  profile: {
    user_id: string;
    full_name: string | null;
    avatar_url: string | null;
    timezone: string | null;
    is_platform_admin: boolean;
    created_at: string;
  } | null;
  space_memberships: Array<{
    space_id: string;
    role: SpaceRole;
    joined_at: string;
    spaces: { slug: string; name: string } | null;
  }>;
  terminal_memberships: Array<{
    terminal_id: string;
    role: string;
    added_at: string;
    terminals: { ticker: string; name: string; space_id: string } | null;
  }>;
  tokens: Array<{
    id: string;
    name: string;
    token_prefix: string;
    scopes: string[];
    created_at: string;
    last_used_at: string | null;
    expires_at: string | null;
    revoked_at: string | null;
  }>;
}

type Tab = "overview" | "memberships" | "tokens" | "notes" | "danger";

export function AdminUserDetail({ data }: { data: AdminUserDetailData }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isSuspended = Boolean(
    data.user.banned_until && new Date(data.user.banned_until) > new Date(),
  );

  function flashError(msg: string) {
    setError(msg);
    setSuccess(null);
  }
  function flashSuccess(msg: string) {
    setSuccess(msg);
    setError(null);
    setTimeout(() => setSuccess(null), 2500);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-4 rounded border border-border bg-bg-1 p-3 text-sm">
        <div className="flex flex-wrap gap-1">
          {data.profile?.is_platform_admin ? (
            <AdminBadge variant="accent">platform admin</AdminBadge>
          ) : null}
          {isSuspended ? (
            <AdminBadge variant="danger">
              suspended until {new Date(data.user.banned_until!).toLocaleString()}
            </AdminBadge>
          ) : (
            <AdminBadge variant="muted">active</AdminBadge>
          )}
          {!data.user.email_confirmed_at ? (
            <AdminBadge variant="warning">unconfirmed email</AdminBadge>
          ) : null}
        </div>
        <span className="text-[11px] text-text-3">
          Joined {new Date(data.user.created_at).toLocaleString()}
        </span>
        <span className="text-[11px] text-text-3">
          Last seen{" "}
          {data.user.last_sign_in_at
            ? new Date(data.user.last_sign_in_at).toLocaleString()
            : "never"}
        </span>
      </div>

      {error ? (
        <p className="flex items-center gap-1 rounded-sm border border-danger/40 bg-danger-subtle px-3 py-1.5 text-xs text-danger">
          <AlertCircle className="h-3 w-3" /> {error}
        </p>
      ) : null}
      {success ? (
        <p className="flex items-center gap-1 rounded-sm border border-success/40 bg-success-subtle px-3 py-1.5 text-xs text-success">
          <Check className="h-3 w-3" /> {success}
        </p>
      ) : null}

      <nav className="flex flex-wrap gap-1 border-b border-border">
        {(
          [
            ["overview", "Overview"],
            ["memberships", `Memberships (${data.space_memberships.length})`],
            ["tokens", `Tokens (${data.tokens.length})`],
            ["notes", "Notes"],
            ["danger", "Danger zone"],
          ] as Array<[Tab, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "border-b-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide",
              tab === id
                ? "border-accent text-text-0"
                : "border-transparent text-text-3 hover:text-text-1",
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "overview" ? (
        <OverviewTab
          data={data}
          isSuspended={isSuspended}
          onSuccess={flashSuccess}
          onError={flashError}
        />
      ) : null}
      {tab === "memberships" ? (
        <MembershipsTab data={data} onSuccess={flashSuccess} onError={flashError} />
      ) : null}
      {tab === "tokens" ? <TokensTab data={data} /> : null}
      {tab === "notes" ? (
        <NotesTab userId={data.user.id} onError={flashError} />
      ) : null}
      {tab === "danger" ? (
        <DangerTab
          data={data}
          isSuspended={isSuspended}
          onError={flashError}
          onDeleted={() => router.push("/admin/users")}
        />
      ) : null}
    </>
  );
}

/* -------------------------------------------------------------------- */
/* Overview                                                              */
/* -------------------------------------------------------------------- */

function OverviewTab({
  data,
  isSuspended,
  onSuccess,
  onError,
}: {
  data: AdminUserDetailData;
  isSuspended: boolean;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(data.profile?.full_name ?? "");
  const [timezone, setTimezone] = useState(data.profile?.timezone ?? "");
  const [email, setEmail] = useState(data.user.email);
  const [isAdmin, setIsAdmin] = useState(
    data.profile?.is_platform_admin ?? false,
  );
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {
        full_name: fullName,
        timezone: timezone || null,
        is_platform_admin: isAdmin,
      };
      if (email.trim().toLowerCase() !== data.user.email.toLowerCase()) {
        patch.email = email.trim().toLowerCase();
      }
      const r = await fetch(`/api/v1/admin/users/${data.user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(patch),
      });
      if (!r.ok) {
        onError(await msg(r));
        return;
      }
      onSuccess("Saved");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPanel title="Profile">
      <form onSubmit={save} className="flex flex-col gap-3 p-4">
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-sm border border-border bg-bg-0 px-2 py-1.5 font-mono text-sm text-text-0 outline-none focus:border-border-focus"
          />
          <p className="mt-1 text-[10px] text-text-3">
            Changing the email triggers re-verification by default.
          </p>
        </Field>
        <Field label="Full name">
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            maxLength={120}
            className="w-full rounded-sm border border-border bg-bg-0 px-2 py-1.5 text-sm text-text-0 outline-none focus:border-border-focus"
          />
        </Field>
        <Field label="Timezone">
          <input
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            placeholder="America/New_York"
            maxLength={60}
            className="w-full rounded-sm border border-border bg-bg-0 px-2 py-1.5 font-mono text-sm text-text-0 outline-none focus:border-border-focus"
          />
        </Field>
        <Field label="Role">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isAdmin}
              onChange={(e) => setIsAdmin(e.target.checked)}
            />
            <span>Platform admin</span>
          </label>
        </Field>
        <footer className="flex items-center justify-between gap-2">
          <ResetPasswordButton
            userId={data.user.id}
            email={data.user.email}
            onSuccess={onSuccess}
            onError={onError}
          />
          <div className="flex gap-2">
            <SuspendButton
              userId={data.user.id}
              isSuspended={isSuspended}
              onSuccess={onSuccess}
              onError={onError}
            />
            <RevokeSessionsButton
              userId={data.user.id}
              onSuccess={onSuccess}
              onError={onError}
            />
            <AdminButton type="submit" variant="accent" disabled={saving}>
              <Check className="h-3 w-3" />
              {saving ? "Saving…" : "Save"}
            </AdminButton>
          </div>
        </footer>
      </form>
    </AdminPanel>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid grid-cols-1 gap-1 md:grid-cols-[160px_1fr] md:items-start md:gap-3">
      <span className="pt-1.5 text-[10px] uppercase tracking-wide text-text-3">
        {label}
      </span>
      <div>{children}</div>
    </label>
  );
}

function ResetPasswordButton({
  userId,
  email,
  onSuccess,
  onError,
}: {
  userId: string;
  email: string;
  onSuccess: (m: string) => void;
  onError: (m: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"email" | "set">("email");
  const [newPwd, setNewPwd] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const r = await fetch(
        `/api/v1/admin/users/${userId}/reset-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(
            mode === "email"
              ? { send_email: true }
              : { password: newPwd },
          ),
        },
      );
      if (!r.ok) {
        onError(await msg(r));
        return;
      }
      onSuccess(
        mode === "email"
          ? `Recovery link sent to ${email}`
          : "Password updated",
      );
      setOpen(false);
      setNewPwd("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AdminButton onClick={() => setOpen(true)}>
        <KeyRound className="h-3 w-3" /> Reset password
      </AdminButton>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={submit}
        title="Reset password"
        confirmLabel="Reset"
        busy={busy}
        body={
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={mode === "email"}
                onChange={() => setMode("email")}
              />
              <Mail className="h-3.5 w-3.5 text-text-3" /> Email a recovery link
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={mode === "set"}
                onChange={() => setMode("set")}
              />
              <KeyRound className="h-3.5 w-3.5 text-text-3" /> Set a new password directly
            </label>
            {mode === "set" ? (
              <input
                type="password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                placeholder="Min. 8 characters"
                className="rounded-sm border border-border bg-bg-0 px-2 py-1.5 font-mono text-sm text-text-0 outline-none focus:border-border-focus"
              />
            ) : null}
            <p className="text-[11px] text-text-3">
              All current sessions for this user will be ended.
            </p>
          </div>
        }
      />
    </>
  );
}

function SuspendButton({
  userId,
  isSuspended,
  onSuccess,
  onError,
}: {
  userId: string;
  isSuspended: boolean;
  onSuccess: (m: string) => void;
  onError: (m: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState(24);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function suspend() {
    setBusy(true);
    try {
      const r = await fetch(
        `/api/v1/admin/users/${userId}/suspend`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ hours, reason }),
        },
      );
      if (!r.ok) {
        onError(await msg(r));
        return;
      }
      onSuccess(`Suspended for ${hours} hours`);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }
  async function unsuspend() {
    setBusy(true);
    try {
      const r = await fetch(
        `/api/v1/admin/users/${userId}/suspend`,
        { method: "DELETE", credentials: "include" },
      );
      if (!r.ok) {
        onError(await msg(r));
        return;
      }
      onSuccess("Unsuspended");
    } finally {
      setBusy(false);
    }
  }

  if (isSuspended) {
    return (
      <AdminButton onClick={unsuspend} disabled={busy}>
        <PlayCircle className="h-3 w-3" /> Unsuspend
      </AdminButton>
    );
  }

  return (
    <>
      <AdminButton variant="danger" onClick={() => setOpen(true)}>
        <PauseCircle className="h-3 w-3" /> Suspend
      </AdminButton>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={suspend}
        title="Suspend user"
        confirmLabel="Suspend"
        destructive
        busy={busy}
        body={
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-text-3">
                Duration (hours)
              </span>
              <input
                type="number"
                min="1"
                max="8760"
                value={hours}
                onChange={(e) => setHours(Math.max(1, Number(e.target.value)))}
                className="rounded-sm border border-border bg-bg-0 px-2 py-1.5 font-mono text-sm text-text-0 outline-none focus:border-border-focus"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-text-3">
                Reason (visible to other admins)
              </span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={1000}
                className="rounded-sm border border-border bg-bg-0 px-2 py-1.5 text-sm text-text-0 outline-none focus:border-border-focus"
              />
            </label>
            <p className="text-[11px] text-text-3">
              All current sessions will be terminated immediately.
            </p>
          </div>
        }
      />
    </>
  );
}

function RevokeSessionsButton({
  userId,
  onSuccess,
  onError,
}: {
  userId: string;
  onSuccess: (m: string) => void;
  onError: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <AdminButton
      onClick={async () => {
        setBusy(true);
        try {
          const r = await fetch(
            `/api/v1/admin/users/${userId}/revoke-sessions`,
            { method: "POST", credentials: "include" },
          );
          if (!r.ok) {
            onError(await msg(r));
            return;
          }
          onSuccess("Sessions revoked");
        } finally {
          setBusy(false);
        }
      }}
      disabled={busy}
    >
      <Power className="h-3 w-3" /> Sign out
    </AdminButton>
  );
}

/* -------------------------------------------------------------------- */
/* Memberships                                                           */
/* -------------------------------------------------------------------- */

function MembershipsTab({
  data,
  onSuccess,
  onError,
}: {
  data: AdminUserDetailData;
  onSuccess: (m: string) => void;
  onError: (m: string) => void;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<PickedSpace | null>(null);
  const [role, setRole] = useState<SpaceRole>("member");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!picked) return;
    setBusy(true);
    try {
      const r = await fetch(
        `/api/v1/admin/users/${data.user.id}/memberships`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ space_id: picked.space_id, role }),
        },
      );
      if (!r.ok) {
        onError(await msg(r));
        return;
      }
      onSuccess(`Added to ${picked.name}`);
      setPicked(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(spaceId: string, spaceName: string) {
    if (!confirm(`Remove from ${spaceName}? They'll lose access immediately.`))
      return;
    const r = await fetch(
      `/api/v1/admin/users/${data.user.id}/memberships?space_id=${spaceId}`,
      { method: "DELETE", credentials: "include" },
    );
    if (!r.ok) {
      onError(await msg(r));
      return;
    }
    onSuccess(`Removed from ${spaceName}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <AdminPanel title="Add to a space">
        <div className="flex flex-wrap items-end gap-2 p-3">
          <div className="flex-1 min-w-[280px]">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-text-3">
              Space
            </span>
            <SpacePicker selected={picked} onSelect={setPicked} />
          </div>
          <div>
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-text-3">
              Role
            </span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as SpaceRole)}
              className="rounded-sm border border-border bg-bg-2 px-2 py-1.5 font-mono text-[11px] uppercase text-text-1 outline-none focus:border-border-focus"
            >
              <option value="owner">owner</option>
              <option value="admin">admin</option>
              <option value="member">member</option>
            </select>
          </div>
          <AdminButton
            variant="accent"
            disabled={!picked || busy}
            onClick={add}
          >
            <Plus className="h-3 w-3" /> Add
          </AdminButton>
        </div>
      </AdminPanel>

      <AdminPanel title={`Spaces (${data.space_memberships.length})`}>
        {data.space_memberships.length === 0 ? (
          <AdminEmpty>Not a member of any space.</AdminEmpty>
        ) : (
          <AdminTable className="border-0">
            <thead>
              <tr className="border-b border-border bg-bg-2">
                <AdminTh>Name</AdminTh>
                <AdminTh>Slug</AdminTh>
                <AdminTh>Role</AdminTh>
                <AdminTh>Joined</AdminTh>
                <AdminTh align="right">Actions</AdminTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.space_memberships.map((m) => (
                <tr key={m.space_id}>
                  <AdminTd>{m.spaces?.name ?? m.space_id.slice(0, 8)}</AdminTd>
                  <AdminTd mono>{m.spaces?.slug ?? "—"}</AdminTd>
                  <AdminTd>
                    <AdminBadge>{m.role}</AdminBadge>
                  </AdminTd>
                  <AdminTd>
                    <span className="text-xs text-text-3">
                      {new Date(m.joined_at).toLocaleDateString()}
                    </span>
                  </AdminTd>
                  <AdminTd align="right">
                    <AdminButton
                      variant="danger"
                      onClick={() =>
                        void remove(
                          m.space_id,
                          m.spaces?.name ?? m.space_id.slice(0, 8),
                        )
                      }
                    >
                      <X className="h-3 w-3" /> Remove
                    </AdminButton>
                  </AdminTd>
                </tr>
              ))}
            </tbody>
          </AdminTable>
        )}
      </AdminPanel>

      <AdminPanel
        title={`Terminals (${data.terminal_memberships.length})`}
      >
        {data.terminal_memberships.length === 0 ? (
          <AdminEmpty>No terminal memberships.</AdminEmpty>
        ) : (
          <AdminTable className="border-0">
            <thead>
              <tr className="border-b border-border bg-bg-2">
                <AdminTh>Ticker</AdminTh>
                <AdminTh>Name</AdminTh>
                <AdminTh>Role</AdminTh>
                <AdminTh>Added</AdminTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.terminal_memberships.map((tm) => (
                <tr key={tm.terminal_id}>
                  <AdminTd mono>{tm.terminals?.ticker ?? "—"}</AdminTd>
                  <AdminTd>{tm.terminals?.name ?? "—"}</AdminTd>
                  <AdminTd>
                    <AdminBadge>{tm.role}</AdminBadge>
                  </AdminTd>
                  <AdminTd>
                    <span className="text-xs text-text-3">
                      {new Date(tm.added_at).toLocaleDateString()}
                    </span>
                  </AdminTd>
                </tr>
              ))}
            </tbody>
          </AdminTable>
        )}
      </AdminPanel>
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Tokens                                                                */
/* -------------------------------------------------------------------- */

function TokensTab({ data }: { data: AdminUserDetailData }) {
  if (data.tokens.length === 0)
    return <AdminEmpty>No access tokens.</AdminEmpty>;
  return (
    <AdminPanel title="Access tokens">
      <AdminTable className="border-0">
        <thead>
          <tr className="border-b border-border bg-bg-2">
            <AdminTh>Name</AdminTh>
            <AdminTh>Prefix</AdminTh>
            <AdminTh>Scopes</AdminTh>
            <AdminTh>Created</AdminTh>
            <AdminTh>Last used</AdminTh>
            <AdminTh>Status</AdminTh>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.tokens.map((t) => (
            <tr key={t.id}>
              <AdminTd>{t.name}</AdminTd>
              <AdminTd mono>{t.token_prefix}…</AdminTd>
              <AdminTd mono>{(t.scopes ?? []).join(", ")}</AdminTd>
              <AdminTd>
                <span className="text-xs text-text-3">
                  {new Date(t.created_at).toLocaleDateString()}
                </span>
              </AdminTd>
              <AdminTd>
                <span className="text-xs text-text-3">
                  {t.last_used_at
                    ? new Date(t.last_used_at).toLocaleString()
                    : "never"}
                </span>
              </AdminTd>
              <AdminTd>
                {t.revoked_at ? (
                  <AdminBadge variant="danger">revoked</AdminBadge>
                ) : t.expires_at && new Date(t.expires_at) < new Date() ? (
                  <AdminBadge variant="warning">expired</AdminBadge>
                ) : (
                  <AdminBadge variant="success">active</AdminBadge>
                )}
              </AdminTd>
            </tr>
          ))}
        </tbody>
      </AdminTable>
    </AdminPanel>
  );
}

/* -------------------------------------------------------------------- */
/* Notes                                                                 */
/* -------------------------------------------------------------------- */

interface Note {
  id: string;
  body: string;
  author_user_id: string;
  author_name: string | null;
  created_at: string;
}

function NotesTab({
  userId,
  onError,
}: {
  userId: string;
  onError: (m: string) => void;
}) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/v1/admin/users/${userId}/notes`, { credentials: "include" })
      .then((r) => r.json())
      .then((b: { data?: Note[] }) => setNotes(b.data ?? []))
      .catch(() => setNotes([]));
  }, [userId]);

  async function add() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/v1/admin/users/${userId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body: text.trim() }),
      });
      if (!r.ok) {
        onError(await msg(r));
        return;
      }
      const b = (await r.json()) as { data: Note };
      setNotes((prev) => [b.data, ...(prev ?? [])]);
      setText("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <AdminPanel title="Add a note">
        <div className="flex flex-col gap-2 p-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="Internal note. Visible to other platform admins only."
            className="rounded-sm border border-border bg-bg-0 px-2 py-1.5 text-sm text-text-0 outline-none focus:border-border-focus"
          />
          <div className="flex justify-end">
            <AdminButton
              variant="accent"
              disabled={!text.trim() || busy}
              onClick={add}
            >
              <StickyNote className="h-3 w-3" /> Add note
            </AdminButton>
          </div>
        </div>
      </AdminPanel>

      {notes === null ? (
        <AdminEmpty>Loading…</AdminEmpty>
      ) : notes.length === 0 ? (
        <AdminEmpty>No notes yet.</AdminEmpty>
      ) : (
        <ul className="flex flex-col gap-2">
          {notes.map((n) => (
            <li
              key={n.id}
              className="rounded border border-border bg-bg-1 p-3"
            >
              <p className="whitespace-pre-wrap text-sm text-text-1">
                {n.body}
              </p>
              <p className="mt-1 text-[11px] text-text-3">
                — {n.author_name ?? "(admin)"} ·{" "}
                {new Date(n.created_at).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Danger zone                                                           */
/* -------------------------------------------------------------------- */

function DangerTab({
  data,
  isSuspended,
  onError,
  onDeleted,
}: {
  data: AdminUserDetailData;
  isSuspended: boolean;
  onError: (m: string) => void;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      const r = await fetch(`/api/v1/admin/users/${data.user.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) {
        onError(await msg(r));
        return;
      }
      onDeleted();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPanel title="Danger zone">
      <div className="flex flex-col gap-3 p-4">
        <Row
          icon={<Shield className="h-4 w-4 text-warning" />}
          title="Suspended status"
          body={
            isSuspended
              ? `Currently suspended until ${new Date(data.user.banned_until!).toLocaleString()}.`
              : "Currently active. Use the Suspend button on the Overview tab."
          }
        />
        <Row
          icon={<ShieldOff className="h-4 w-4 text-text-2" />}
          title="Platform admin"
          body={
            data.profile?.is_platform_admin
              ? "User has full platform-admin access."
              : "Standard user."
          }
        />
        <Row
          icon={<Trash2 className="h-4 w-4 text-danger" />}
          title="Delete user permanently"
          body={
            <span>
              This removes the auth.users row and cascades through all
              membership / token / activity tables. The seeded admin
              account cannot be deleted from here in production.
            </span>
          }
          action={
            <AdminButton variant="danger" onClick={() => setOpen(true)}>
              Delete user
            </AdminButton>
          }
        />
        <ConfirmDialog
          open={open}
          onClose={() => setOpen(false)}
          onConfirm={remove}
          title="Permanently delete this user"
          confirmLabel="Delete forever"
          destructive
          typeToConfirm={data.user.email}
          busy={busy}
          body={
            <p>
              Type the user&apos;s email exactly to confirm. This cascades
              through every membership, token, file ownership, and activity
              row. There is no undo.
            </p>
          }
        />
      </div>
    </AdminPanel>
  );
}

function Row({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded border border-border bg-bg-2 p-3">
      <span className="mt-0.5">{icon}</span>
      <div className="flex-1 text-sm">
        <p className="text-text-0">{title}</p>
        <p className="mt-0.5 text-xs text-text-3">{body}</p>
      </div>
      {action ? <div className="flex-shrink-0">{action}</div> : null}
    </div>
  );
}

async function msg(r: Response): Promise<string> {
  try {
    const body = (await r.json()) as { errors?: { message: string }[] };
    return body.errors?.[0]?.message ?? `HTTP ${r.status}`;
  } catch {
    return `HTTP ${r.status}`;
  }
}
