"use client";

import { useMemo, useState } from "react";
import { Shield, ShieldOff, Power, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AdminUserRow {
  user_id: string;
  email: string;
  full_name: string | null;
  timezone: string | null;
  is_platform_admin: boolean;
  created_at: string;
  last_sign_in_at: string | null;
}

export function AdminUsersTable({ initial }: { initial: AdminUserRow[] }) {
  const [rows, setRows] = useState(initial);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (r) =>
        r.email.toLowerCase().includes(s) ||
        (r.full_name ?? "").toLowerCase().includes(s),
    );
  }, [rows, q]);

  async function toggleAdmin(u: AdminUserRow) {
    if (
      !confirm(
        u.is_platform_admin
          ? `Demote ${u.email}? They'll lose platform-admin privileges.`
          : `Promote ${u.email} to platform admin? They'll gain full read+write access.`,
      )
    )
      return;
    setBusy(u.user_id);
    setError(null);
    try {
      const r = await fetch(`/api/v1/admin/users/${u.user_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ is_platform_admin: !u.is_platform_admin }),
      });
      if (!r.ok) {
        setError(await messageOf(r));
        return;
      }
      setRows((prev) =>
        prev.map((x) =>
          x.user_id === u.user_id
            ? { ...x, is_platform_admin: !u.is_platform_admin }
            : x,
        ),
      );
    } finally {
      setBusy(null);
    }
  }

  async function forceSignOut(u: AdminUserRow) {
    if (!confirm(`Force-sign-out ${u.email}? Their tabs will redirect to login.`))
      return;
    setBusy(u.user_id);
    setError(null);
    try {
      const r = await fetch(
        `/api/v1/admin/users/${u.user_id}/revoke-sessions`,
        { method: "POST", credentials: "include" },
      );
      if (!r.ok) setError(await messageOf(r));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 rounded border border-border bg-bg-1 px-3 py-2">
        <Search className="h-3.5 w-3.5 text-text-3" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by email or name…"
          className="flex-1 bg-transparent text-sm text-text-0 placeholder:text-text-3 outline-none"
        />
      </div>

      {error ? (
        <p className="rounded-sm border border-danger/40 bg-danger-subtle px-3 py-1.5 text-xs text-danger">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded border border-border bg-bg-1">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-bg-2 text-[10px] uppercase tracking-wide text-text-3">
              <th className="px-3 py-2 text-left font-semibold">Email</th>
              <th className="px-3 py-2 text-left font-semibold">Name</th>
              <th className="px-3 py-2 text-left font-semibold">Timezone</th>
              <th className="px-3 py-2 text-left font-semibold">Last seen</th>
              <th className="px-3 py-2 text-left font-semibold">Admin</th>
              <th className="px-3 py-2 text-left font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((u) => (
              <tr key={u.user_id}>
                <td className="px-3 py-2 font-mono text-xs text-text-1">
                  {u.email}
                </td>
                <td className="px-3 py-2 text-text-1">{u.full_name ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-text-3">
                  {u.timezone ?? "—"}
                </td>
                <td className="px-3 py-2 text-xs text-text-3">
                  {u.last_sign_in_at
                    ? new Date(u.last_sign_in_at).toLocaleString()
                    : "never"}
                </td>
                <td className="px-3 py-2">
                  {u.is_platform_admin ? (
                    <span className="inline-flex items-center gap-1 rounded-sm border border-accent/40 bg-accent-subtle px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-accent">
                      <Shield className="h-3 w-3" /> admin
                    </span>
                  ) : (
                    <span className="text-[10px] uppercase text-text-3">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => void toggleAdmin(u)}
                      disabled={busy === u.user_id}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-sm border border-border bg-bg-2 px-1.5 py-0.5 text-[11px] text-text-1 hover:bg-bg-3",
                        busy === u.user_id && "cursor-not-allowed opacity-50",
                      )}
                    >
                      {u.is_platform_admin ? (
                        <>
                          <ShieldOff className="h-3 w-3" /> Demote
                        </>
                      ) : (
                        <>
                          <Shield className="h-3 w-3" /> Promote
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => void forceSignOut(u)}
                      disabled={busy === u.user_id}
                      title="Force sign-out"
                      className={cn(
                        "inline-flex items-center gap-1 rounded-sm border border-danger/40 bg-danger-subtle px-1.5 py-0.5 text-[11px] text-danger hover:bg-danger/20",
                        busy === u.user_id && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <Power className="h-3 w-3" /> Sign out
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-6 text-center text-xs text-text-3"
                >
                  No users match.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
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
