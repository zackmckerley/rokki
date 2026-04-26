"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, Power, PowerOff, AlertCircle, Check } from "lucide-react";
import {
  AdminBadge,
  AdminButton,
  AdminEmpty,
  AdminPanel,
  AdminTable,
  AdminTd,
  AdminTh,
} from "@/components/admin/primitives";

interface Row {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  description: string | null;
  created_at: string;
}

export function AdminWebhooksClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<{
    id: string;
    secret: string;
  } | null>(null);

  const load = useCallback(() => {
    fetch("/api/v1/admin/webhooks", { credentials: "include" })
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

  async function toggle(id: string, active: boolean) {
    setBusy(id);
    try {
      const r = await fetch(`/api/v1/admin/webhooks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ active }),
      });
      if (!r.ok) {
        setError(await msg(r));
        return;
      }
      flash(active ? "Activated" : "Deactivated");
      load();
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this webhook? Future events won't be delivered."))
      return;
    setBusy(id);
    try {
      const r = await fetch(`/api/v1/admin/webhooks/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) {
        setError(await msg(r));
        return;
      }
      flash("Deleted");
      load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <NewForm
        onCreated={(id, secret) => {
          flash("Webhook created");
          setRevealedSecret({ id, secret });
          load();
        }}
        onError={setError}
      />
      {revealedSecret ? (
        <div className="rounded border border-warning/40 bg-warning-subtle p-3 text-xs">
          <p className="font-semibold text-warning">
            Save this secret — it will not be shown again
          </p>
          <code className="mt-1 block break-all font-mono text-text-0">
            {revealedSecret.secret}
          </code>
          <button
            onClick={() => setRevealedSecret(null)}
            className="mt-2 text-[10px] uppercase tracking-wide text-text-3 hover:text-text-0"
          >
            dismiss
          </button>
        </div>
      ) : null}
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
        <AdminEmpty
          panel
          body="Outbound webhooks let external systems subscribe to Rokki events."
        >
          No webhooks configured.
        </AdminEmpty>
      ) : (
        <AdminPanel>
          <AdminTable className="border-0">
            <thead>
              <tr className="border-b border-border bg-bg-2">
                <AdminTh>URL</AdminTh>
                <AdminTh>Events</AdminTh>
                <AdminTh>Status</AdminTh>
                <AdminTh align="right">Actions</AdminTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((w) => (
                <tr key={w.id}>
                  <AdminTd mono>
                    <span className="block max-w-md truncate">{w.url}</span>
                  </AdminTd>
                  <AdminTd>
                    <div className="flex flex-wrap gap-1">
                      {w.events.map((e) => (
                        <AdminBadge key={e}>{e}</AdminBadge>
                      ))}
                    </div>
                  </AdminTd>
                  <AdminTd>
                    {w.active ? (
                      <AdminBadge variant="success">active</AdminBadge>
                    ) : (
                      <AdminBadge variant="muted">paused</AdminBadge>
                    )}
                  </AdminTd>
                  <AdminTd align="right">
                    <div className="flex justify-end gap-1">
                      <AdminButton
                        onClick={() => void toggle(w.id, !w.active)}
                        disabled={busy === w.id}
                      >
                        {w.active ? (
                          <PowerOff className="h-3 w-3" />
                        ) : (
                          <Power className="h-3 w-3" />
                        )}
                        {w.active ? "Pause" : "Resume"}
                      </AdminButton>
                      <AdminButton
                        variant="danger"
                        onClick={() => void remove(w.id)}
                        disabled={busy === w.id}
                      >
                        <Trash2 className="h-3 w-3" />
                      </AdminButton>
                    </div>
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

function NewForm({
  onCreated,
  onError,
}: {
  onCreated: (id: string, secret: string) => void;
  onError: (m: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [eventsCsv, setEventsCsv] = useState(
    "terminal.created,task.created,space.member.added",
  );
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const events = eventsCsv
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    if (!url || events.length === 0) {
      onError("URL and at least one event required.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/v1/admin/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url, events }),
      });
      if (!r.ok) {
        onError(await msg(r));
        return;
      }
      const body = (await r.json()) as { data: { id: string; secret: string } };
      onCreated(body.data.id, body.data.secret);
      setUrl("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPanel title="New webhook">
      <form onSubmit={submit} className="flex flex-col gap-3 p-4">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-text-3">
            URL *
          </span>
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/rokki/hook"
            className="rounded-sm border border-border bg-bg-0 px-2 py-1.5 font-mono text-sm text-text-0 outline-none focus:border-border-focus"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-text-3">
            Subscribe to events (comma-separated names from domain_events)
          </span>
          <input
            value={eventsCsv}
            onChange={(e) => setEventsCsv(e.target.value)}
            className="rounded-sm border border-border bg-bg-0 px-2 py-1.5 font-mono text-sm text-text-0 outline-none focus:border-border-focus"
          />
        </label>
        <div className="flex justify-end">
          <AdminButton type="submit" variant="accent" disabled={busy}>
            <Plus className="h-3 w-3" /> {busy ? "Creating…" : "Create"}
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
