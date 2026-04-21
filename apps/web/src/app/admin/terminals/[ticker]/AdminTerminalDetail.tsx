"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Archive, ArchiveRestore, Crown, AlertCircle, Check } from "lucide-react";
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

type TerminalStatus = "planning" | "active" | "blocked" | "done" | "archived";

export interface AdminTerminalDetailData {
  terminal: {
    id: string;
    ticker: string;
    name: string;
    description: string | null;
    type: string;
    status: TerminalStatus;
    archived_at: string | null;
    created_at: string;
    space_id: string;
    spaces: { slug: string; name: string } | null;
  };
  members: Array<{
    user_id: string;
    role: string;
    added_at: string;
    full_name: string | null;
    email: string;
  }>;
  stats: {
    task_count: number;
    task_completed: number;
    file_count: number;
    last_activity_at: string | null;
  };
}

export function AdminTerminalDetail({
  data,
}: {
  data: AdminTerminalDetailData;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const archived = Boolean(data.terminal.archived_at);

  function flashError(m: string) {
    setError(m);
    setSuccess(null);
  }
  function flashSuccess(m: string) {
    setSuccess(m);
    setError(null);
    setTimeout(() => setSuccess(null), 2500);
  }

  async function archive() {
    setBusy(true);
    try {
      const r = await fetch(
        `/api/v1/admin/terminals/${data.terminal.ticker}/archive`,
        { method: "POST", credentials: "include" },
      );
      if (!r.ok) {
        flashError(await msg(r));
        return;
      }
      flashSuccess("Archived");
      setArchiveOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    setBusy(true);
    try {
      const r = await fetch(
        `/api/v1/admin/terminals/${data.terminal.ticker}/archive`,
        { method: "DELETE", credentials: "include" },
      );
      if (!r.ok) {
        flashError(await msg(r));
        return;
      }
      flashSuccess("Restored");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function transferOwner(userId: string, email: string) {
    if (
      !confirm(
        `Make ${email} the owner of this terminal? Current owners are demoted to manager.`,
      )
    )
      return;
    const r = await fetch(
      `/api/v1/admin/terminals/${data.terminal.ticker}/transfer-owner`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ new_owner_user_id: userId }),
      },
    );
    if (!r.ok) {
      flashError(await msg(r));
      return;
    }
    flashSuccess(`Ownership transferred to ${email}`);
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {archived ? (
          <AdminBadge variant="warning">archived</AdminBadge>
        ) : (
          <AdminBadge variant="success">{data.terminal.status}</AdminBadge>
        )}
        <span className="text-[11px] text-text-3">
          Type {data.terminal.type}
        </span>
        <span className="text-[11px] text-text-3">
          Created {new Date(data.terminal.created_at).toLocaleDateString()}
        </span>
        <span className="text-[11px] text-text-3">
          Last activity{" "}
          {data.stats.last_activity_at
            ? new Date(data.stats.last_activity_at).toLocaleString()
            : "never"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Tasks" value={data.stats.task_count} />
        <Stat
          label="Completed"
          value={data.stats.task_completed}
          subtitle={
            data.stats.task_count > 0
              ? `${Math.round(
                  (data.stats.task_completed / data.stats.task_count) * 100,
                )}%`
              : undefined
          }
        />
        <Stat label="Files" value={data.stats.file_count} />
        <Stat label="Members" value={data.members.length} />
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

      <AdminPanel title="Members">
        {data.members.length === 0 ? (
          <AdminEmpty>No members.</AdminEmpty>
        ) : (
          <AdminTable className="border-0">
            <thead>
              <tr className="border-b border-border bg-bg-2">
                <AdminTh>Email</AdminTh>
                <AdminTh>Name</AdminTh>
                <AdminTh>Role</AdminTh>
                <AdminTh>Added</AdminTh>
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
                    <AdminBadge>{m.role}</AdminBadge>
                  </AdminTd>
                  <AdminTd>
                    <span className="text-xs text-text-3">
                      {new Date(m.added_at).toLocaleDateString()}
                    </span>
                  </AdminTd>
                  <AdminTd align="right">
                    {m.role !== "owner" ? (
                      <AdminButton
                        title="Promote to owner"
                        onClick={() => void transferOwner(m.user_id, m.email)}
                      >
                        <Crown className="h-3 w-3" /> Make owner
                      </AdminButton>
                    ) : null}
                  </AdminTd>
                </tr>
              ))}
            </tbody>
          </AdminTable>
        )}
      </AdminPanel>

      <AdminPanel title="Danger zone">
        <div className="flex flex-col gap-3 p-4">
          {archived ? (
            <div className="flex items-start gap-3 rounded border border-warning/40 bg-warning-subtle p-3">
              <ArchiveRestore className="mt-0.5 h-4 w-4 text-warning" />
              <div className="flex-1 text-sm">
                <p className="text-text-0">Terminal is archived</p>
                <p className="mt-0.5 text-xs text-text-3">
                  Archived{" "}
                  {new Date(data.terminal.archived_at!).toLocaleString()}.
                </p>
              </div>
              <AdminButton onClick={restore} disabled={busy}>
                <ArchiveRestore className="h-3 w-3" /> Restore
              </AdminButton>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded border border-border bg-bg-2 p-3">
              <Archive className="mt-0.5 h-4 w-4 text-danger" />
              <div className="flex-1 text-sm">
                <p className="text-text-0">Archive this terminal</p>
                <p className="mt-0.5 text-xs text-text-3">
                  History and files are preserved. Members lose write access.
                </p>
              </div>
              <AdminButton variant="danger" onClick={() => setArchiveOpen(true)}>
                <Archive className="h-3 w-3" /> Archive
              </AdminButton>
            </div>
          )}
        </div>
      </AdminPanel>

      <ConfirmDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={archive}
        title="Archive terminal"
        confirmLabel="Archive"
        destructive
        typeToConfirm={data.terminal.ticker}
        busy={busy}
        body={<p>Type the ticker to confirm. You can restore later.</p>}
      />
    </>
  );
}

function Stat({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: number;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded border border-border bg-bg-1 p-3">
      <span className="text-[10px] uppercase tracking-wide text-text-3">
        {label}
      </span>
      <span className="font-mono text-2xl tabular-nums text-text-0">
        {value.toLocaleString()}
      </span>
      {subtitle ? (
        <span className="text-[10px] text-text-3">{subtitle}</span>
      ) : null}
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
