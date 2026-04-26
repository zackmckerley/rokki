"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ShieldAlert, X, Check, AlertCircle } from "lucide-react";
import {
  AdminBadge,
  AdminButton,
  AdminEmpty,
  AdminPanel,
  AdminTable,
  AdminTd,
  AdminTh,
} from "@/components/admin/primitives";
import { UserPicker, type PickedUser } from "@/components/admin/UserPicker";

interface Grant {
  id: string;
  admin_id: string;
  target_user_id: string;
  target_space_id: string | null;
  target_terminal_id: string | null;
  reason: string;
  started_at: string;
  ended_at: string | null;
  active_until: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
}

export function AdminEmergencyClient() {
  const [active, setActive] = useState<Grant[]>([]);
  const [history, setHistory] = useState<Grant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([
      fetch("/api/v1/admin/emergency?active=true", {
        credentials: "include",
      }).then((r) => r.json()),
      fetch("/api/v1/admin/emergency", { credentials: "include" }).then((r) =>
        r.json(),
      ),
    ])
      .then(([a, h]: [{ data?: Grant[] }, { data?: Grant[] }]) => {
        setActive(a.data ?? []);
        setHistory(h.data ?? []);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "load failed"),
      );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function flash(m: string) {
    setSuccess(m);
    setTimeout(() => setSuccess(null), 3000);
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this grant immediately?")) return;
    setBusy(id);
    try {
      const r = await fetch(`/api/v1/admin/emergency/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) {
        setError(await msg(r));
        return;
      }
      flash("Revoked");
      load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <GrantForm onCreated={load} onError={setError} onSuccess={flash} />

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

      <AdminPanel title={`Active grants (${active.length})`}>
        {active.length === 0 ? (
          <AdminEmpty>No active grants.</AdminEmpty>
        ) : (
          <AdminTable className="border-0">
            <thead>
              <tr className="border-b border-border bg-bg-2">
                <AdminTh>Target user</AdminTh>
                <AdminTh>Scope</AdminTh>
                <AdminTh>Reason</AdminTh>
                <AdminTh>Expires</AdminTh>
                <AdminTh align="right">Actions</AdminTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {active.map((g) => (
                <tr key={g.id}>
                  <AdminTd mono>
                    <Link
                      href={`/admin/users/${g.target_user_id}`}
                      className="text-text-1 hover:text-accent"
                    >
                      {g.target_user_id.slice(0, 12)}
                    </Link>
                  </AdminTd>
                  <AdminTd mono>
                    {g.target_terminal_id
                      ? `terminal: ${g.target_terminal_id.slice(0, 8)}`
                      : g.target_space_id
                        ? `space: ${g.target_space_id.slice(0, 8)}`
                        : "—"}
                  </AdminTd>
                  <AdminTd>
                    <span className="block max-w-md truncate">{g.reason}</span>
                  </AdminTd>
                  <AdminTd>
                    <span className="text-xs text-text-3">
                      {g.active_until
                        ? new Date(g.active_until).toLocaleString()
                        : "—"}
                    </span>
                  </AdminTd>
                  <AdminTd align="right">
                    <AdminButton
                      variant="danger"
                      onClick={() => void revoke(g.id)}
                      disabled={busy === g.id}
                    >
                      <X className="h-3 w-3" /> Revoke
                    </AdminButton>
                  </AdminTd>
                </tr>
              ))}
            </tbody>
          </AdminTable>
        )}
      </AdminPanel>

      <AdminPanel title={`History (${history.length})`}>
        {history.length === 0 ? (
          <AdminEmpty>No emergency-access events recorded.</AdminEmpty>
        ) : (
          <AdminTable className="border-0">
            <thead>
              <tr className="border-b border-border bg-bg-2">
                <AdminTh>Started</AdminTh>
                <AdminTh>Admin</AdminTh>
                <AdminTh>Target</AdminTh>
                <AdminTh>Status</AdminTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {history.map((g) => {
                const isActive =
                  !g.revoked_at &&
                  g.active_until &&
                  new Date(g.active_until) > new Date();
                return (
                  <tr key={g.id}>
                    <AdminTd>
                      <span className="text-xs text-text-3">
                        {new Date(g.started_at).toLocaleString()}
                      </span>
                    </AdminTd>
                    <AdminTd mono>
                      <Link
                        href={`/admin/users/${g.admin_id}`}
                        className="text-text-1 hover:text-accent"
                      >
                        {g.admin_id.slice(0, 12)}
                      </Link>
                    </AdminTd>
                    <AdminTd mono>
                      <Link
                        href={`/admin/users/${g.target_user_id}`}
                        className="text-text-1 hover:text-accent"
                      >
                        {g.target_user_id.slice(0, 12)}
                      </Link>
                    </AdminTd>
                    <AdminTd>
                      {g.revoked_at ? (
                        <AdminBadge variant="muted">revoked</AdminBadge>
                      ) : isActive ? (
                        <AdminBadge variant="warning">active</AdminBadge>
                      ) : (
                        <AdminBadge variant="muted">expired</AdminBadge>
                      )}
                    </AdminTd>
                  </tr>
                );
              })}
            </tbody>
          </AdminTable>
        )}
      </AdminPanel>
    </div>
  );
}

function GrantForm({
  onCreated,
  onError,
  onSuccess,
}: {
  onCreated: () => void;
  onError: (m: string) => void;
  onSuccess: (m: string) => void;
}) {
  const [target, setTarget] = useState<PickedUser | null>(null);
  const [terminalTicker, setTerminalTicker] = useState("");
  const [hours, setHours] = useState(1);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target || !reason || reason.length < 10) {
      onError("Pick a target user and provide a justification ≥ 10 chars.");
      return;
    }
    setBusy(true);
    try {
      // Resolve ticker → terminal_id.
      let terminalId: string | undefined;
      if (terminalTicker.trim()) {
        const r = await fetch(
          `/api/v1/projects/${terminalTicker.trim().toUpperCase()}`,
          { credentials: "include" },
        );
        if (r.ok) {
          const body = (await r.json()) as { data?: { id?: string } };
          terminalId = body.data?.id;
        }
      }

      const r = await fetch("/api/v1/admin/emergency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          target_user_id: target.user_id,
          target_terminal_id: terminalId,
          hours,
          reason,
        }),
      });
      if (!r.ok) {
        onError(await msg(r));
        return;
      }
      onSuccess(`Granted ${hours}h to ${target.email}`);
      setTarget(null);
      setTerminalTicker("");
      setReason("");
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPanel title="Grant emergency access">
      <form onSubmit={submit} className="flex flex-col gap-3 p-4">
        <Field label="Supporting (target user) *">
          <UserPicker selected={target} onSelect={setTarget} />
        </Field>
        <Field label="Terminal ticker">
          <input
            value={terminalTicker}
            onChange={(e) => setTerminalTicker(e.target.value)}
            placeholder="e.g. HLX (optional — leave empty for space-wide)"
            className="w-full rounded-sm border border-border bg-bg-0 px-2 py-1.5 font-mono text-sm uppercase text-text-0 outline-none focus:border-border-focus"
          />
        </Field>
        <Field label="Duration (hours) *">
          <input
            type="number"
            min="1"
            max="24"
            value={hours}
            onChange={(e) => setHours(Math.max(1, Number(e.target.value)))}
            className="w-24 rounded-sm border border-border bg-bg-0 px-2 py-1.5 font-mono text-sm text-text-0 outline-none focus:border-border-focus"
          />
        </Field>
        <Field label="Justification * (≥ 10 chars)">
          <textarea
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Ticket id + summary of what you'll inspect"
            className="w-full rounded-sm border border-border bg-bg-0 px-2 py-1.5 text-sm text-text-0 outline-none focus:border-border-focus"
          />
        </Field>
        <footer className="flex justify-end">
          <AdminButton type="submit" variant="accent" disabled={busy}>
            <ShieldAlert className="h-3 w-3" />
            {busy ? "Granting…" : "Grant access"}
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
    <label className="grid grid-cols-1 gap-1 md:grid-cols-[200px_1fr] md:items-start md:gap-3">
      <span className="pt-1.5 text-[10px] uppercase tracking-wide text-text-3">
        {label}
      </span>
      <div>{children}</div>
    </label>
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
