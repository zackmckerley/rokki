"use client";

import { useEffect, useState, useCallback } from "react";
import { Trash2, Save, AlertCircle, Check } from "lucide-react";
import {
  AdminBadge,
  AdminButton,
  AdminEmpty,
  AdminPanel,
  AdminTable,
  AdminTd,
  AdminTh,
} from "@/components/admin/primitives";
import { SpacePicker, type PickedSpace } from "@/components/admin/SpacePicker";

interface Row {
  id: string;
  key: string;
  scope: "global" | "space" | "user";
  scope_id: string | null;
  value: unknown;
  rollout_percentage: number;
  description: string | null;
  updated_at: string;
}

export function AdminFlagsClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/v1/admin/flags", { credentials: "include" })
      .then((r) => r.json())
      .then((b: { data?: Row[] }) => setRows(b.data ?? []))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "load failed"),
      );
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  function flash(m: string) {
    setSuccess(m);
    setTimeout(() => setSuccess(null), 2500);
  }

  async function remove(id: string, key: string) {
    if (
      !confirm(
        `Remove flag "${key}"? Any client code reading this flag will fall back to its default.`,
      )
    )
      return;
    setBusy(id);
    try {
      const r = await fetch(`/api/v1/admin/flags?id=${id}`, {
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
      <NewFlagForm onCreated={load} onError={setError} onSuccess={flash} />
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
      {rows.length === 0 ? (
        <AdminEmpty>No flags configured.</AdminEmpty>
      ) : (
        <AdminPanel>
          <AdminTable className="border-0">
            <thead>
              <tr className="border-b border-border bg-bg-2">
                <AdminTh>Key</AdminTh>
                <AdminTh>Scope</AdminTh>
                <AdminTh>Value</AdminTh>
                <AdminTh align="right">Rollout %</AdminTh>
                <AdminTh>Updated</AdminTh>
                <AdminTh align="right">Actions</AdminTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id}>
                  <AdminTd mono>{r.key}</AdminTd>
                  <AdminTd>
                    <AdminBadge>{r.scope}</AdminBadge>
                    {r.scope_id ? (
                      <span className="ml-1 font-mono text-[10px] text-text-3">
                        {r.scope_id.slice(0, 8)}
                      </span>
                    ) : null}
                  </AdminTd>
                  <AdminTd mono>
                    <code className="block max-w-md truncate">
                      {JSON.stringify(r.value)}
                    </code>
                  </AdminTd>
                  <AdminTd align="right" mono>
                    {r.rollout_percentage}
                  </AdminTd>
                  <AdminTd>
                    <span className="text-xs text-text-3">
                      {new Date(r.updated_at).toLocaleString()}
                    </span>
                  </AdminTd>
                  <AdminTd align="right">
                    <AdminButton
                      variant="danger"
                      onClick={() => void remove(r.id, r.key)}
                      disabled={busy === r.id}
                    >
                      <Trash2 className="h-3 w-3" />
                    </AdminButton>
                  </AdminTd>
                </tr>
              ))}
            </tbody>
          </AdminTable>
        </AdminPanel>
      )}
    </div>
  );
}

function NewFlagForm({
  onCreated,
  onError,
  onSuccess,
}: {
  onCreated: () => void;
  onError: (m: string) => void;
  onSuccess: (m: string) => void;
}) {
  const [key, setKey] = useState("");
  const [valueJson, setValueJson] = useState("true");
  const [rollout, setRollout] = useState(100);
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<"global" | "space">("global");
  const [space, setSpace] = useState<PickedSpace | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (scope === "space" && !space) {
      onError("Pick a space when scope is per-space.");
      return;
    }
    setBusy(true);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(valueJson);
      } catch {
        onError(
          "Value must be valid JSON. Use `true`, `42`, `\"text\"`, or `{\"a\":1}`.",
        );
        return;
      }
      const r = await fetch("/api/v1/admin/flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          key,
          scope,
          scope_id: scope === "space" ? space?.space_id : null,
          value: parsed,
          rollout_percentage: rollout,
          description,
        }),
      });
      if (!r.ok) {
        onError(await msg(r));
        return;
      }
      onSuccess(`Flag ${key} set (${scope})`);
      setKey("");
      setValueJson("true");
      setSpace(null);
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPanel title="Set or update a flag">
      <form
        onSubmit={submit}
        className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2"
      >
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-text-3">
            Key *
          </span>
          <input
            value={key}
            onChange={(e) => setKey(e.target.value.toLowerCase())}
            required
            maxLength={80}
            placeholder="e.g. dashboard_v2"
            className="rounded-sm border border-border bg-bg-0 px-2 py-1.5 font-mono text-sm text-text-0 outline-none focus:border-border-focus"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-text-3">
            Rollout %
          </span>
          <input
            type="number"
            min="0"
            max="100"
            value={rollout}
            onChange={(e) => setRollout(Math.max(0, Number(e.target.value)))}
            className="rounded-sm border border-border bg-bg-0 px-2 py-1.5 font-mono text-sm text-text-0 outline-none focus:border-border-focus"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-text-3">
            Scope
          </span>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as "global" | "space")}
            className="rounded-sm border border-border bg-bg-2 px-2 py-1.5 font-mono text-[11px] uppercase text-text-1 outline-none focus:border-border-focus"
          >
            <option value="global">global</option>
            <option value="space">per-space override</option>
          </select>
        </label>
        {scope === "space" ? (
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-text-3">
              Space *
            </span>
            <SpacePicker selected={space} onSelect={setSpace} />
          </label>
        ) : (
          <div />
        )}
        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="text-[10px] uppercase tracking-wide text-text-3">
            Value (JSON) *
          </span>
          <textarea
            value={valueJson}
            onChange={(e) => setValueJson(e.target.value)}
            rows={3}
            placeholder='Examples: true · 42 · "string" · {"enabled":true,"message":"…"}'
            className="rounded-sm border border-border bg-bg-0 px-2 py-1.5 font-mono text-sm text-text-0 outline-none focus:border-border-focus"
          />
        </label>
        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="text-[10px] uppercase tracking-wide text-text-3">
            Description
          </span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            className="rounded-sm border border-border bg-bg-0 px-2 py-1.5 text-sm text-text-0 outline-none focus:border-border-focus"
          />
        </label>
        <div className="flex items-end justify-end md:col-span-2">
          <AdminButton type="submit" variant="accent" disabled={busy || !key}>
            <Save className="h-3 w-3" /> {busy ? "Saving…" : "Save flag"}
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
