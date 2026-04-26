"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Archive,
  ArchiveRestore,
  AlertCircle,
  Check,
  Plus,
  X,
  Crown,
} from "lucide-react";
import {
  AdminBadge,
  AdminButton,
  AdminEmpty,
  AdminPanel,
  AdminTable,
  AdminTd,
  AdminTh,
} from "@/components/admin/primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { UserPicker, type PickedUser } from "@/components/admin/UserPicker";
import { cn } from "@/lib/utils";

type SpaceRole = "owner" | "admin" | "member";

export interface AdminSpaceDetailData {
  space: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    archived_at: string | null;
    created_at: string;
    created_by: string;
  };
  members: Array<{
    user_id: string;
    role: SpaceRole;
    joined_at: string;
    full_name: string | null;
    email: string;
  }>;
  terminals: Array<{
    id: string;
    ticker: string;
    name: string;
    status: string;
    archived_at: string | null;
    created_at: string;
  }>;
  usage: {
    terminal_count: number;
    member_count: number;
    file_count: number;
    task_count: number;
  };
}

type Tab = "overview" | "members" | "terminals" | "danger";

export function AdminSpaceDetail({ data }: { data: AdminSpaceDetailData }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function flashError(m: string) {
    setError(m);
    setSuccess(null);
  }
  function flashSuccess(m: string) {
    setSuccess(m);
    setError(null);
    setTimeout(() => setSuccess(null), 2500);
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Members" value={data.usage.member_count} />
        <Stat label="Terminals" value={data.usage.terminal_count} />
        <Stat label="Files" value={data.usage.file_count} />
        <Stat label="Tasks" value={data.usage.task_count} />
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
            ["members", `Members (${data.members.length})`],
            ["terminals", `Terminals (${data.terminals.length})`],
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
        <OverviewTab data={data} onSuccess={flashSuccess} onError={flashError} />
      ) : null}
      {tab === "members" ? (
        <MembersTab data={data} onSuccess={flashSuccess} onError={flashError} />
      ) : null}
      {tab === "terminals" ? <TerminalsTab data={data} /> : null}
      {tab === "danger" ? (
        <DangerTab
          data={data}
          onSuccess={flashSuccess}
          onError={flashError}
          onArchived={() => router.push("/admin/spaces")}
        />
      ) : null}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5 rounded border border-border bg-bg-1 p-3">
      <span className="text-[10px] uppercase tracking-wide text-text-3">
        {label}
      </span>
      <span className="font-mono text-2xl tabular-nums text-text-0">
        {value.toLocaleString()}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Overview                                                              */
/* -------------------------------------------------------------------- */

function OverviewTab({
  data,
  onSuccess,
  onError,
}: {
  data: AdminSpaceDetailData;
  onSuccess: (m: string) => void;
  onError: (m: string) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(data.space.name);
  const [slug, setSlug] = useState(data.space.slug);
  const [description, setDescription] = useState(data.space.description ?? "");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await fetch(`/api/v1/admin/spaces/${data.space.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim().toLowerCase(),
          description: description.trim() || null,
        }),
      });
      if (!r.ok) {
        onError(await msg(r));
        return;
      }
      const body = (await r.json()) as { data: { slug: string } };
      onSuccess("Saved");
      if (body.data.slug !== data.space.slug) {
        router.push(`/admin/spaces/${body.data.slug}`);
      } else {
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPanel title="Identity">
      <form onSubmit={save} className="flex flex-col gap-3 p-4">
        <Field label="Name *">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            className="w-full rounded-sm border border-border bg-bg-0 px-2 py-1.5 text-sm text-text-0 outline-none focus:border-border-focus"
          />
        </Field>
        <Field label="Slug *">
          <input
            required
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            maxLength={40}
            className="w-full rounded-sm border border-border bg-bg-0 px-2 py-1.5 font-mono text-sm text-text-0 outline-none focus:border-border-focus"
          />
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            maxLength={1000}
            className="w-full rounded-sm border border-border bg-bg-0 px-2 py-1.5 text-sm text-text-0 outline-none focus:border-border-focus"
          />
        </Field>
        <footer className="flex justify-end">
          <AdminButton type="submit" variant="accent" disabled={saving}>
            <Check className="h-3 w-3" />
            {saving ? "Saving…" : "Save"}
          </AdminButton>
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
    <label className="grid grid-cols-1 gap-1 md:grid-cols-[140px_1fr] md:items-start md:gap-3">
      <span className="pt-1.5 text-[10px] uppercase tracking-wide text-text-3">
        {label}
      </span>
      <div>{children}</div>
    </label>
  );
}

/* -------------------------------------------------------------------- */
/* Members                                                               */
/* -------------------------------------------------------------------- */

function MembersTab({
  data,
  onSuccess,
  onError,
}: {
  data: AdminSpaceDetailData;
  onSuccess: (m: string) => void;
  onError: (m: string) => void;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<PickedUser | null>(null);
  const [role, setRole] = useState<SpaceRole>("member");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!picked) return;
    setBusy(true);
    try {
      const r = await fetch(
        `/api/v1/admin/spaces/${data.space.slug}/members`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ user_id: picked.user_id, role }),
        },
      );
      if (!r.ok) {
        onError(await msg(r));
        return;
      }
      onSuccess(`Added ${picked.email}`);
      setPicked(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(userId: string, next: SpaceRole) {
    const member = data.members.find((m) => m.user_id === userId);
    const email = member?.email ?? userId.slice(0, 8);
    const current = member?.role;
    if (current === next) return;
    if (
      !confirm(
        `Change ${email}'s role from ${current ?? "?"} to ${next}? They take effect on their next request.`,
      )
    ) {
      router.refresh(); // re-render reverts the dropdown
      return;
    }
    const r = await fetch(`/api/v1/admin/spaces/${data.space.slug}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ user_id: userId, role: next }),
    });
    if (!r.ok) {
      onError(await msg(r));
      router.refresh();
      return;
    }
    onSuccess("Role updated");
    router.refresh();
  }

  async function remove(userId: string, email: string) {
    if (!confirm(`Remove ${email} from this space?`)) return;
    const r = await fetch(
      `/api/v1/admin/users/${userId}/memberships?space_id=${data.space.id}`,
      { method: "DELETE", credentials: "include" },
    );
    if (!r.ok) {
      onError(await msg(r));
      return;
    }
    onSuccess(`Removed ${email}`);
    router.refresh();
  }

  async function transferOwner(userId: string, email: string) {
    if (
      !confirm(
        `Make ${email} the owner of this space? Current owners are demoted to admin.`,
      )
    )
      return;
    const r = await fetch(
      `/api/v1/admin/spaces/${data.space.slug}/transfer-owner`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ new_owner_user_id: userId }),
      },
    );
    if (!r.ok) {
      onError(await msg(r));
      return;
    }
    onSuccess(`Ownership transferred to ${email}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <AdminPanel title="Add member">
        <div className="flex flex-wrap items-end gap-2 p-3">
          <div className="flex-1 min-w-[280px]">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-text-3">
              User
            </span>
            <UserPicker selected={picked} onSelect={setPicked} />
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
          <AdminButton variant="accent" disabled={!picked || busy} onClick={add}>
            <Plus className="h-3 w-3" /> Add
          </AdminButton>
        </div>
      </AdminPanel>

      <AdminPanel title={`Members (${data.members.length})`}>
        {data.members.length === 0 ? (
          <AdminEmpty>No members.</AdminEmpty>
        ) : (
          <AdminTable className="border-0">
            <thead>
              <tr className="border-b border-border bg-bg-2">
                <AdminTh>Email</AdminTh>
                <AdminTh>Name</AdminTh>
                <AdminTh>Role</AdminTh>
                <AdminTh>Joined</AdminTh>
                <AdminTh align="right">Actions</AdminTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.members.map((m) => (
                <tr key={m.user_id}>
                  <AdminTd mono>
                    <Link
                      href={`/admin/users/${m.user_id}`}
                      className="text-text-0 hover:text-accent"
                    >
                      {m.email}
                    </Link>
                  </AdminTd>
                  <AdminTd>{m.full_name ?? "—"}</AdminTd>
                  <AdminTd>
                    <select
                      value={m.role}
                      onChange={(e) =>
                        void changeRole(m.user_id, e.target.value as SpaceRole)
                      }
                      className="rounded-sm border border-border bg-bg-2 px-2 py-1 font-mono text-[11px] uppercase text-text-1 outline-none focus:border-border-focus"
                    >
                      <option value="owner">owner</option>
                      <option value="admin">admin</option>
                      <option value="member">member</option>
                    </select>
                  </AdminTd>
                  <AdminTd>
                    <span className="text-xs text-text-3">
                      {new Date(m.joined_at).toLocaleDateString()}
                    </span>
                  </AdminTd>
                  <AdminTd align="right">
                    <div className="flex justify-end gap-1">
                      {m.role !== "owner" ? (
                        <AdminButton
                          onClick={() => void transferOwner(m.user_id, m.email)}
                          title="Make owner"
                        >
                          <Crown className="h-3 w-3" />
                        </AdminButton>
                      ) : null}
                      <AdminButton
                        variant="danger"
                        onClick={() => void remove(m.user_id, m.email)}
                      >
                        <X className="h-3 w-3" /> Remove
                      </AdminButton>
                    </div>
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
/* Terminals                                                             */
/* -------------------------------------------------------------------- */

function TerminalsTab({ data }: { data: AdminSpaceDetailData }) {
  if (data.terminals.length === 0)
    return <AdminEmpty>No terminals in this space yet.</AdminEmpty>;
  return (
    <AdminPanel title="Terminals">
      <AdminTable className="border-0">
        <thead>
          <tr className="border-b border-border bg-bg-2">
            <AdminTh>Ticker</AdminTh>
            <AdminTh>Name</AdminTh>
            <AdminTh>Status</AdminTh>
            <AdminTh>Created</AdminTh>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.terminals.map((t) => (
            <tr key={t.id}>
              <AdminTd mono>
                <Link
                  href={`/admin/terminals/${t.ticker}`}
                  className="text-accent hover:underline"
                >
                  {t.ticker}
                </Link>
              </AdminTd>
              <AdminTd>{t.name}</AdminTd>
              <AdminTd>
                {t.archived_at ? (
                  <AdminBadge variant="warning">archived</AdminBadge>
                ) : (
                  <AdminBadge variant="success">{t.status}</AdminBadge>
                )}
              </AdminTd>
              <AdminTd>
                <span className="text-xs text-text-3">
                  {new Date(t.created_at).toLocaleDateString()}
                </span>
              </AdminTd>
            </tr>
          ))}
        </tbody>
      </AdminTable>
    </AdminPanel>
  );
}

/* -------------------------------------------------------------------- */
/* Danger zone                                                           */
/* -------------------------------------------------------------------- */

function DangerTab({
  data,
  onSuccess,
  onError,
  onArchived,
}: {
  data: AdminSpaceDetailData;
  onSuccess: (m: string) => void;
  onError: (m: string) => void;
  onArchived: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const archived = Boolean(data.space.archived_at);

  async function archive() {
    setBusy(true);
    try {
      const r = await fetch(`/api/v1/admin/spaces/${data.space.slug}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) {
        onError(await msg(r));
        return;
      }
      onArchived();
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    setBusy(true);
    try {
      const r = await fetch(
        `/api/v1/admin/spaces/${data.space.slug}/restore`,
        { method: "POST", credentials: "include" },
      );
      if (!r.ok) {
        onError(await msg(r));
        return;
      }
      onSuccess("Restored");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPanel title="Danger zone">
      <div className="flex flex-col gap-3 p-4">
        {archived ? (
          <div className="flex items-start gap-3 rounded border border-warning/40 bg-warning-subtle p-3">
            <ArchiveRestore className="mt-0.5 h-3.5 w-3.5 text-warning" />
            <div className="flex-1 text-sm">
              <p className="text-text-0">Space is archived</p>
              <p className="mt-0.5 text-xs text-text-3">
                Archived {new Date(data.space.archived_at!).toLocaleString()}.
                Restore to make it active again.
              </p>
            </div>
            <AdminButton onClick={restore} disabled={busy}>
              <ArchiveRestore className="h-3 w-3" /> Restore
            </AdminButton>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded border border-border bg-bg-2 p-3">
            <Archive className="mt-0.5 h-3.5 w-3.5 text-danger" />
            <div className="flex-1 text-sm">
              <p className="text-text-0">Archive this space</p>
              <p className="mt-0.5 text-xs text-text-3">
                Soft-deletes the space. Members keep their data; new
                terminals can&apos;t be created. Restore re-enables it.
              </p>
            </div>
            <AdminButton variant="danger" onClick={() => setOpen(true)}>
              <Archive className="h-3 w-3" /> Archive
            </AdminButton>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={archive}
        title="Archive space"
        confirmLabel="Archive"
        destructive
        typeToConfirm={data.space.slug}
        busy={busy}
        body={
          <p>
            Type the slug to confirm. You can restore the space later from
            the same page.
          </p>
        }
      />
    </AdminPanel>
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
