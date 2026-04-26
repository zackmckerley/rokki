"use client";

import { useEffect, useState, useCallback } from "react";
import { Megaphone, Trash2, Check, AlertCircle } from "lucide-react";
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
  body: string;
  audience: "all" | "admins" | "space";
  audience_space_id: string | null;
  starts_at: string;
  ends_at: string | null;
  dismissible: boolean;
  created_at: string;
}

export function AdminAnnouncementsClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/v1/admin/announcements", { credentials: "include" })
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

  async function remove(id: string, body: string) {
    const preview = body.length > 80 ? `${body.slice(0, 80)}…` : body;
    if (!confirm(`Delete this announcement?\n\n"${preview}"`)) return;
    setBusy(id);
    try {
      const r = await fetch(`/api/v1/admin/announcements/${id}`, {
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
      <NewAnnouncementForm onCreated={load} onError={setError} onSuccess={flash} />
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
          body="Maintenance windows or platform-wide notes go here. None scheduled."
        >
          No announcements.
        </AdminEmpty>
      ) : (
        <AdminPanel title={`${rows.length} announcement${rows.length === 1 ? "" : "s"}`}>
          <AdminTable className="border-0">
            <thead>
              <tr className="border-b border-border bg-bg-2">
                <AdminTh>Body</AdminTh>
                <AdminTh>Audience</AdminTh>
                <AdminTh>Starts</AdminTh>
                <AdminTh>Ends</AdminTh>
                <AdminTh align="right">Actions</AdminTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id}>
                  <AdminTd>
                    <span className="block max-w-md truncate">{r.body}</span>
                  </AdminTd>
                  <AdminTd>
                    <AdminBadge>{r.audience}</AdminBadge>
                  </AdminTd>
                  <AdminTd>
                    <span className="text-xs text-text-3">
                      {new Date(r.starts_at).toLocaleString()}
                    </span>
                  </AdminTd>
                  <AdminTd>
                    <span className="text-xs text-text-3">
                      {r.ends_at
                        ? new Date(r.ends_at).toLocaleString()
                        : "no end"}
                    </span>
                  </AdminTd>
                  <AdminTd align="right">
                    <AdminButton
                      variant="danger"
                      onClick={() => void remove(r.id, r.body)}
                      disabled={busy === r.id}
                    >
                      <Trash2 className="h-3 w-3" /> Delete
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

function NewAnnouncementForm({
  onCreated,
  onError,
  onSuccess,
}: {
  onCreated: () => void;
  onError: (m: string) => void;
  onSuccess: (m: string) => void;
}) {
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<"all" | "admins" | "space">("all");
  const [endsDays, setEndsDays] = useState(7);
  const [dismissible, setDismissible] = useState(true);
  const [space, setSpace] = useState<PickedSpace | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (body.trim().length < 1) {
      onError("Body required.");
      return;
    }
    if (audience === "space" && !space) {
      onError("Pick a space when audience is 'space'.");
      return;
    }
    setBusy(true);
    try {
      const ends_at =
        endsDays > 0
          ? new Date(Date.now() + endsDays * 86_400_000).toISOString()
          : null;
      const r = await fetch("/api/v1/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          body: body.trim(),
          audience,
          audience_space_id: audience === "space" ? space?.space_id : null,
          ends_at,
          dismissible,
        }),
      });
      if (!r.ok) {
        onError(await msg(r));
        return;
      }
      onSuccess("Announcement posted");
      setBody("");
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPanel title="Post announcement">
      <form onSubmit={submit} className="flex flex-col gap-3 p-4">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={4000}
          placeholder="Markdown supported. Keep it short — this shows above the TopBar."
          className="rounded-sm border border-border bg-bg-0 px-2 py-1.5 text-sm text-text-0 outline-none focus:border-border-focus"
        />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-[10px] uppercase tracking-wide text-text-3">
              Audience
            </span>
            <select
              value={audience}
              onChange={(e) =>
                setAudience(e.target.value as "all" | "admins" | "space")
              }
              className="rounded-sm border border-border bg-bg-2 px-2 py-1 font-mono text-[11px] uppercase text-text-1 outline-none focus:border-border-focus"
            >
              <option value="all">all users</option>
              <option value="admins">admins only</option>
              <option value="space">one space</option>
            </select>
          </label>
          {audience === "space" ? (
            <label className="flex flex-1 min-w-[240px] items-center gap-2 text-sm">
              <span className="text-[10px] uppercase tracking-wide text-text-3">
                Space
              </span>
              <div className="flex-1">
                <SpacePicker selected={space} onSelect={setSpace} />
              </div>
            </label>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <span className="text-[10px] uppercase tracking-wide text-text-3">
              Expires (days)
            </span>
            <input
              type="number"
              min="0"
              max="365"
              value={endsDays}
              onChange={(e) =>
                setEndsDays(Math.max(0, Number(e.target.value)))
              }
              className="w-16 rounded-sm border border-border bg-bg-0 px-2 py-1 font-mono text-sm text-text-0 outline-none focus:border-border-focus"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={dismissible}
              onChange={(e) => setDismissible(e.target.checked)}
            />
            Users can dismiss
          </label>
          <div className="ml-auto">
            <AdminButton type="submit" variant="accent" disabled={busy}>
              <Megaphone className="h-3 w-3" />
              {busy ? "Posting…" : "Post"}
            </AdminButton>
          </div>
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
