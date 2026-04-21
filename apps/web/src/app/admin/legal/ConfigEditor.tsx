"use client";

import { useState } from "react";
import { Save, AlertCircle, Check } from "lucide-react";
import { AdminButton, AdminPanel } from "@/components/admin/primitives";

export function ConfigEditor({
  configKey,
  label,
  kind,
  value,
}: {
  configKey: string;
  label: string;
  kind: "markdown" | "json";
  value: unknown;
}) {
  const initial =
    kind === "json"
      ? JSON.stringify(value, null, 2)
      : typeof value === "string"
        ? value
        : "";
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      let parsed: unknown = text;
      if (kind === "json") {
        try {
          parsed = JSON.parse(text);
        } catch {
          setError("Value must be valid JSON.");
          return;
        }
      }
      const r = await fetch(`/api/v1/admin/config/${configKey}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ value: parsed }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as {
          errors?: { message: string }[];
        };
        setError(body.errors?.[0]?.message ?? `HTTP ${r.status}`);
        return;
      }
      setSavedAt(Date.now());
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPanel title={label}>
      <div className="flex flex-col gap-2 p-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={kind === "markdown" ? 14 : 8}
          className="w-full rounded-sm border border-border bg-bg-0 px-2 py-1.5 font-mono text-sm text-text-0 outline-none focus:border-border-focus"
        />
        <footer className="flex items-center justify-end gap-3">
          {error ? (
            <span className="flex items-center gap-1 text-xs text-danger">
              <AlertCircle className="h-3 w-3" /> {error}
            </span>
          ) : savedAt ? (
            <span className="flex items-center gap-1 text-xs text-success">
              <Check className="h-3 w-3" /> Saved
            </span>
          ) : null}
          <AdminButton variant="accent" onClick={save} disabled={busy}>
            <Save className="h-3 w-3" /> {busy ? "Saving…" : "Save"}
          </AdminButton>
        </footer>
      </div>
    </AdminPanel>
  );
}
