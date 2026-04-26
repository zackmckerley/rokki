"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GitMerge, Server, User as UserIcon } from "lucide-react";
import { Dialog } from "@/components/Dialog";
import type { QueueEntry } from "@/lib/offline-queue";
import { discardEntry, onConflict } from "@/lib/offline-queue";
import { offlineFetch } from "@/lib/offline-fetch";

/**
 * Three-way conflict resolution:
 *   * "Use mine"       — re-send the queued mutation but with the latest
 *                         server `updated_at`/`edited_at` so it is no
 *                         longer stale, then drop the queue entry.
 *   * "Use server's"   — discard the queued mutation entirely.
 *   * "Merge manually" — open a side-by-side editor; user picks fields,
 *                         confirm sends the merged patch as a fresh
 *                         mutation.
 *
 * The dialog is endpoint-agnostic. It introspects the body shape the user
 * sent vs the row the server returned and renders matching fields. For
 * fields it doesn't recognise, it falls back to a JSON diff.
 */

export interface ConflictPayload {
  entry: QueueEntry;
  server: unknown;
}

interface Props {
  open: boolean;
  payload: ConflictPayload | null;
  onClose: () => void;
}

interface ServerShape {
  errors?: { code?: string; message?: string }[];
  current?: Record<string, unknown> | null;
  attempted?: Record<string, unknown> | null;
}

export function ConflictDialog({ open, payload, onClose }: Props) {
  const [mode, setMode] = useState<"choose" | "merge">("choose");
  const [merged, setMerged] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);

  const parsed = useMemo(() => parsePayload(payload), [payload]);

  if (!payload || !parsed) return null;

  const { entry, current, attempted, fields } = parsed;

  function close() {
    setMode("choose");
    setMerged({});
    onClose();
  }

  async function applyMine() {
    if (!parsed) return;
    setBusy(true);
    try {
      // Build a fresh body using the latest server token so we're no
      // longer stale, then re-fire with offlineFetch (which will queue
      // again if we're still offline — that's fine).
      const body = buildMineBody(entry, attempted, current);
      const res = await offlineFetch(entry.url, {
        method: entry.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        label: entry.label ?? "Resolve conflict (use mine)",
      });
      // Either way (queued or sent), drop the original failed entry.
      await discardEntry(entry.id);
      if (!res.ok && res.status !== 202 && res.status !== 409) {
        // Surface but don't block close — the new entry's status is
        // visible in the queue panel.
        console.warn("[conflict] use-mine returned", res.status);
      }
    } finally {
      setBusy(false);
      close();
    }
  }

  async function discardMine() {
    setBusy(true);
    try {
      await discardEntry(entry.id);
    } finally {
      setBusy(false);
      close();
    }
  }

  async function applyMerge() {
    if (!parsed) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { ...merged };
      attachToken(body, entry.url, current);
      const res = await offlineFetch(entry.url, {
        method: entry.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        label: entry.label ?? "Resolve conflict (merge)",
      });
      await discardEntry(entry.id);
      if (!res.ok && res.status !== 202 && res.status !== 409) {
        console.warn("[conflict] merge returned", res.status);
      }
    } finally {
      setBusy(false);
      close();
    }
  }

  function startMerge() {
    // Seed the merged record with the user's intent so a no-op merge
    // matches "Use mine" behaviour.
    setMerged({ ...attempted });
    setMode("merge");
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Resolve conflict"
      className="max-w-2xl"
    >
      <p className="mb-4 text-xs text-text-2">
        While your edit was queued, someone else updated this record. Pick
        which version wins, or merge manually.
      </p>

      {parsed.errorMessage ? (
        <p className="mb-3 rounded-sm border border-warning/40 bg-warning-subtle px-2 py-1 text-[11px] text-warning">
          {parsed.errorMessage}
        </p>
      ) : null}

      {mode === "choose" ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Column
              icon={<UserIcon className="h-3 w-3" />}
              heading="Your edit"
              tone="accent"
            >
              {fields.map((f) => (
                <FieldRow
                  key={`mine-${f.key}`}
                  label={f.label}
                  value={f.attempted}
                  changed={f.changedFromCurrent}
                />
              ))}
            </Column>
            <Column
              icon={<Server className="h-3 w-3" />}
              heading="Server"
              tone="info"
            >
              {fields.map((f) => (
                <FieldRow
                  key={`server-${f.key}`}
                  label={f.label}
                  value={f.current}
                />
              ))}
            </Column>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void discardMine()}
              disabled={busy}
              className="rounded-sm border border-border bg-bg-2 px-3 py-1.5 text-xs text-text-1 hover:bg-bg-3 disabled:opacity-40"
            >
              Use server&apos;s
            </button>
            <button
              type="button"
              onClick={startMerge}
              disabled={busy}
              className="flex items-center gap-1 rounded-sm border border-border bg-bg-2 px-3 py-1.5 text-xs text-text-1 hover:bg-bg-3 disabled:opacity-40"
            >
              <GitMerge className="h-3 w-3" /> Merge manually
            </button>
            <button
              type="button"
              onClick={() => void applyMine()}
              disabled={busy}
              className="rounded-sm bg-accent px-3 py-1.5 text-xs text-bg-0 hover:opacity-90 disabled:opacity-40"
            >
              Use mine
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mb-3 text-[11px] text-text-3">
            For each field choose your version, the server&apos;s, or type
            something new.
          </p>
          <div className="flex flex-col gap-3">
            {fields.map((f) => (
              <MergeRow
                key={f.key}
                field={f}
                value={(merged[f.key] as unknown) ?? f.attempted}
                onChange={(next) =>
                  setMerged((prev) => ({ ...prev, [f.key]: next }))
                }
              />
            ))}
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setMode("choose")}
              disabled={busy}
              className="rounded-sm border border-border bg-bg-2 px-3 py-1.5 text-xs text-text-1 hover:bg-bg-3 disabled:opacity-40"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => void applyMerge()}
              disabled={busy}
              className="rounded-sm bg-accent px-3 py-1.5 text-xs text-bg-0 hover:opacity-90 disabled:opacity-40"
            >
              Save merged version
            </button>
          </div>
        </>
      )}

      <p className="mt-4 border-t border-border pt-2 font-mono text-[10px] text-text-3">
        {entry.method} {entry.url}
      </p>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Listener that wires the queue → dialog                             */
/* ------------------------------------------------------------------ */

/**
 * Mounted at the layout root. Subscribes to `rokki:offline-conflict`
 * events emitted by the queue drain and pops the dialog.
 */
export function ConflictResolver() {
  const [pending, setPending] = useState<ConflictPayload[]>([]);

  useEffect(() => {
    return onConflict((detail) => {
      setPending((prev) => [...prev, detail]);
    });
  }, []);

  const close = useCallback(() => {
    setPending((prev) => prev.slice(1));
  }, []);

  const top = pending[0] ?? null;
  return <ConflictDialog open={top !== null} payload={top} onClose={close} />;
}

/* ------------------------------------------------------------------ */
/* Internals                                                           */
/* ------------------------------------------------------------------ */

interface Field {
  key: string;
  label: string;
  current: unknown;
  attempted: unknown;
  changedFromCurrent: boolean;
}

interface Parsed {
  entry: QueueEntry;
  current: Record<string, unknown> | null;
  attempted: Record<string, unknown>;
  fields: Field[];
  errorMessage: string | null;
}

function parsePayload(p: ConflictPayload | null): Parsed | null {
  if (!p) return null;
  const server = (p.server ?? {}) as ServerShape;
  const attempted = (server.attempted ??
    parseEntryBody(p.entry)) as Record<string, unknown>;
  const current = (server.current as Record<string, unknown> | null) ?? null;
  const fields = buildFields(attempted, current);
  return {
    entry: p.entry,
    current,
    attempted,
    fields,
    errorMessage: server.errors?.[0]?.message ?? null,
  };
}

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  description: "Description",
  status: "Status",
  priority: "Priority",
  due_date: "Due date",
  labels: "Labels",
  body: "Body",
};

function buildFields(
  attempted: Record<string, unknown>,
  current: Record<string, unknown> | null,
): Field[] {
  const keys = Array.from(
    new Set([
      ...Object.keys(attempted ?? {}).filter((k) => !isMetaKey(k)),
      ...((current && intersectKeys(attempted, current)) || []),
    ]),
  );
  return keys.map((key) => {
    const a = attempted[key];
    const c = current?.[key];
    return {
      key,
      label: FIELD_LABELS[key] ?? key,
      current: c,
      attempted: a,
      changedFromCurrent: !equalShallow(a, c),
    };
  });
}

function isMetaKey(k: string): boolean {
  return k === "expected_updated_at" || k === "expected_edited_at";
}

function intersectKeys(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): string[] {
  const ks = Object.keys(a);
  return ks.filter((k) => k in b);
}

function equalShallow(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => x === b[i]);
  }
  return false;
}

function parseEntryBody(entry: QueueEntry): Record<string, unknown> {
  if (!entry.body) return {};
  try {
    const v = JSON.parse(entry.body) as unknown;
    return typeof v === "object" && v !== null
      ? (v as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function buildMineBody(
  entry: QueueEntry,
  attempted: Record<string, unknown>,
  current: Record<string, unknown> | null,
): Record<string, unknown> {
  const body: Record<string, unknown> = { ...attempted };
  attachToken(body, entry.url, current);
  return body;
}

function attachToken(
  body: Record<string, unknown>,
  url: string,
  current: Record<string, unknown> | null,
): void {
  if (!current) return;
  if (url.includes("/comments/") && !url.endsWith("/comments")) {
    body.expected_edited_at =
      (current.edited_at as string | null) ?? "";
  } else if (url.includes("/tasks/") && !url.endsWith("/tasks")) {
    body.expected_updated_at = current.updated_at;
  }
}

/* ------------------------------------------------------------------ */
/* Render bits                                                         */
/* ------------------------------------------------------------------ */

function Column({
  icon,
  heading,
  tone,
  children,
}: {
  icon: React.ReactNode;
  heading: string;
  tone: "accent" | "info";
  children: React.ReactNode;
}) {
  const headerTone =
    tone === "accent"
      ? "bg-accent-subtle text-accent"
      : "bg-info-subtle text-info";
  return (
    <div className="flex flex-col rounded-sm border border-border bg-bg-1">
      <div
        className={`flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider ${headerTone}`}
      >
        {icon}
        {heading}
      </div>
      <div className="flex flex-col gap-1.5 p-2">{children}</div>
    </div>
  );
}

function FieldRow({
  label,
  value,
  changed,
}: {
  label: string;
  value: unknown;
  changed?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-text-3">
        {label}
      </span>
      <span
        className={`whitespace-pre-wrap break-words text-xs ${
          changed ? "text-text-0" : "text-text-2"
        }`}
      >
        {renderValue(value)}
      </span>
    </div>
  );
}

function renderValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.join(", ");
  return JSON.stringify(v, null, 2);
}

function MergeRow({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  return (
    <div className="rounded-sm border border-border bg-bg-1 p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-3">
          {field.label}
        </span>
        <div className="flex items-center gap-1 text-[10px]">
          <button
            type="button"
            onClick={() => onChange(field.attempted)}
            className="rounded-sm bg-accent-subtle px-1.5 py-0.5 text-accent hover:opacity-80"
          >
            Use mine
          </button>
          <button
            type="button"
            onClick={() => onChange(field.current)}
            className="rounded-sm bg-info-subtle px-1.5 py-0.5 text-info hover:opacity-80"
          >
            Use server
          </button>
        </div>
      </div>
      {typeof field.attempted === "string" || typeof field.current === "string" ? (
        <textarea
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[60px] w-full resize-y rounded-sm border border-border bg-bg-0 p-1.5 text-xs text-text-0 outline-none focus:border-border-focus"
        />
      ) : (
        <input
          value={renderValue(value)}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-sm border border-border bg-bg-0 px-1.5 py-1 text-xs text-text-0 outline-none focus:border-border-focus"
        />
      )}
      <div className="mt-1 grid grid-cols-2 gap-2 text-[10px] text-text-3">
        <span>
          mine: <span className="text-accent">{renderValue(field.attempted)}</span>
        </span>
        <span>
          server: <span className="text-info">{renderValue(field.current)}</span>
        </span>
      </div>
    </div>
  );
}
