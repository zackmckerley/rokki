"use client";

import { useEffect, useState, useCallback } from "react";
import { Trash2, Check, AlertCircle } from "lucide-react";
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

interface Quota {
  id: string;
  subject_type: string;
  subject_id: string;
  tool_id: string | null;
  period: "day" | "month";
  limit_credits: number;
  used_credits: number;
  reset_at: string;
  tool: { id: string; slug: string; name: string } | null;
}

interface ToolOption {
  id: string;
  slug: string;
  name: string;
}

export function AdminQuotasClient() {
  const [quotas, setQuotas] = useState<Quota[]>([]);
  const [tools, setTools] = useState<ToolOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/v1/admin/quotas", { credentials: "include" })
      .then((r) => r.json())
      .then((b: { data?: Quota[] }) => setQuotas(b.data ?? []))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "load failed"),
      );
    fetch("/api/v1/tools", { credentials: "include" })
      .then((r) => r.json())
      .then((b: { data?: ToolOption[] }) => setTools(b.data ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function flash(m: string) {
    setSuccess(m);
    setTimeout(() => setSuccess(null), 2500);
  }

  async function remove(id: string) {
    if (!confirm("Remove this quota?")) return;
    setBusy(id);
    try {
      const r = await fetch(`/api/v1/admin/quotas?id=${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) {
        setError(await msg(r));
        return;
      }
      flash("Removed");
      load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <NearCapPanel />
      <NewQuotaForm
        tools={tools}
        onCreated={() => {
          flash("Quota set");
          load();
        }}
        onError={setError}
      />
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
      <AdminPanel title={`Active quotas (${quotas.length})`}>
        {quotas.length === 0 ? (
          <AdminEmpty>No quotas configured.</AdminEmpty>
        ) : (
          <AdminTable className="border-0">
            <thead>
              <tr className="border-b border-border bg-bg-2">
                <AdminTh>Tool</AdminTh>
                <AdminTh>Subject</AdminTh>
                <AdminTh>Period</AdminTh>
                <AdminTh align="right">Used</AdminTh>
                <AdminTh align="right">Limit</AdminTh>
                <AdminTh>Resets</AdminTh>
                <AdminTh align="right">Actions</AdminTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {quotas.map((q) => {
                const usagePct =
                  q.limit_credits > 0
                    ? (q.used_credits / q.limit_credits) * 100
                    : 0;
                const tone =
                  usagePct >= 100
                    ? "danger"
                    : usagePct >= 90
                      ? "warning"
                      : "muted";
                return (
                  <tr key={q.id}>
                    <AdminTd>
                      {q.tool?.name ?? (
                        <span className="text-text-3">unknown</span>
                      )}
                      {q.tool?.slug ? (
                        <span className="ml-1 font-mono text-[10px] text-text-3">
                          {q.tool.slug}
                        </span>
                      ) : null}
                    </AdminTd>
                    <AdminTd mono>
                      {q.subject_type}: {q.subject_id.slice(0, 8)}
                    </AdminTd>
                    <AdminTd>
                      <AdminBadge>{q.period}</AdminBadge>
                    </AdminTd>
                    <AdminTd align="right" mono>
                      {q.used_credits.toLocaleString()}
                    </AdminTd>
                    <AdminTd align="right" mono>
                      {q.limit_credits.toLocaleString()}
                    </AdminTd>
                    <AdminTd>
                      <span className="text-xs text-text-3">
                        {new Date(q.reset_at).toLocaleString()}
                      </span>{" "}
                      <AdminBadge variant={tone}>
                        {Math.round(usagePct)}%
                      </AdminBadge>
                    </AdminTd>
                    <AdminTd align="right">
                      <AdminButton
                        variant="danger"
                        onClick={() => void remove(q.id)}
                        disabled={busy === q.id}
                      >
                        <Trash2 className="h-3 w-3" />
                      </AdminButton>
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

/* -------------------------------------------------------------------------- */
/* Near-cap panel — surface users about to be blocked before they ticket.     */
/* -------------------------------------------------------------------------- */

interface NearCapRow {
  id: string;
  subject_type: string;
  subject_id: string;
  subject_email: string | null;
  tool: { id: string; slug: string; name: string } | null;
  period: "day" | "month";
  limit_credits: number;
  used_credits: number;
  pct: number;
  reset_at: string;
}

function NearCapPanel() {
  const [rows, setRows] = useState<NearCapRow[] | null>(null);

  useEffect(() => {
    fetch("/api/v1/admin/quotas/near-cap?threshold=0.9", {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((b: { data?: NearCapRow[] }) => setRows(b.data ?? []))
      .catch(() => setRows([]));
  }, []);

  if (rows === null || rows.length === 0) return null;

  return (
    <AdminPanel
      title={`Near cap (${rows.length}) — ≥ 90% used`}
      className="border-warning/40"
    >
      <AdminTable className="border-0">
        <thead>
          <tr className="border-b border-border bg-bg-2">
            <AdminTh>Subject</AdminTh>
            <AdminTh>Tool</AdminTh>
            <AdminTh>Period</AdminTh>
            <AdminTh align="right">Used / limit</AdminTh>
            <AdminTh>Resets</AdminTh>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.id}>
              <AdminTd mono>
                {r.subject_email ?? `${r.subject_type}:${r.subject_id.slice(0, 8)}`}
              </AdminTd>
              <AdminTd>
                {r.tool?.name ?? <span className="text-text-3">unknown</span>}
              </AdminTd>
              <AdminTd>
                <AdminBadge>{r.period}</AdminBadge>
              </AdminTd>
              <AdminTd align="right" mono>
                {r.used_credits.toLocaleString()} /{" "}
                {r.limit_credits.toLocaleString()}{" "}
                <AdminBadge variant={r.pct >= 1 ? "danger" : "warning"}>
                  {Math.round(r.pct * 100)}%
                </AdminBadge>
              </AdminTd>
              <AdminTd>
                <span className="text-xs text-text-3">
                  {new Date(r.reset_at).toLocaleString()}
                </span>
              </AdminTd>
            </tr>
          ))}
        </tbody>
      </AdminTable>
    </AdminPanel>
  );
}

function NewQuotaForm({
  tools,
  onCreated,
  onError,
}: {
  tools: ToolOption[];
  onCreated: () => void;
  onError: (m: string) => void;
}) {
  const [toolId, setToolId] = useState("");
  const [subjectType, setSubjectType] = useState<"user" | "org">("user");
  const [user, setUser] = useState<PickedUser | null>(null);
  const [period, setPeriod] = useState<"day" | "month">("day");
  const [limit, setLimit] = useState(100);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!toolId) {
      onError("Pick a tool.");
      return;
    }
    if (subjectType === "user" && !user) {
      onError("Pick a user.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/v1/admin/quotas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          tool_id: toolId,
          subject_type: subjectType,
          subject_id: user!.user_id,
          period,
          limit_credits: limit,
        }),
      });
      if (!r.ok) {
        onError(await msg(r));
        return;
      }
      setLimit(100);
      setUser(null);
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPanel title="Set quota">
      <form
        onSubmit={submit}
        className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2"
      >
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-text-3">
            Tool *
          </span>
          <select
            value={toolId}
            onChange={(e) => setToolId(e.target.value)}
            className="rounded-sm border border-border bg-bg-2 px-2 py-1.5 text-sm text-text-1 outline-none focus:border-border-focus"
          >
            <option value="">— pick a tool —</option>
            {tools.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.slug})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-text-3">
            Period *
          </span>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as "day" | "month")}
            className="rounded-sm border border-border bg-bg-2 px-2 py-1.5 font-mono text-[11px] uppercase text-text-1 outline-none focus:border-border-focus"
          >
            <option value="day">day</option>
            <option value="month">month</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="text-[10px] uppercase tracking-wide text-text-3">
            Subject (user) *
          </span>
          <UserPicker selected={user} onSelect={setUser} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-text-3">
            Limit (credits) *
          </span>
          <input
            type="number"
            min="0"
            max="10000000"
            value={limit}
            onChange={(e) => setLimit(Math.max(0, Number(e.target.value)))}
            className="rounded-sm border border-border bg-bg-0 px-2 py-1.5 font-mono text-sm text-text-0 outline-none focus:border-border-focus"
          />
        </label>
        <div className="flex items-end justify-end">
          <AdminButton type="submit" variant="accent" disabled={busy}>
            <Check className="h-3 w-3" />
            {busy ? "Saving…" : "Set quota"}
          </AdminButton>
        </div>
      </form>
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
