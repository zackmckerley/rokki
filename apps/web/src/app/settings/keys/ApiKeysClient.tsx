"use client";

import { useState } from "react";
import { Trash2, Plus, Key, Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StoredKey {
  id: string;
  provider: string;
  key_hint: string;
  last_used_at: string | null;
  created_at: string;
}

const PROVIDERS = [
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
  { value: "google", label: "Google (Gemini)" },
  { value: "mistral", label: "Mistral" },
  { value: "cohere", label: "Cohere" },
] as const;

export function ApiKeysClient({ initial }: { initial: StoredKey[] }) {
  const [keys, setKeys] = useState<StoredKey[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastAdded, setLastAdded] = useState<string | null>(null);

  // Form state
  const [provider, setProvider] = useState<string>("anthropic");
  const [secret, setSecret] = useState("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setLastAdded(null);
    try {
      const r = await fetch("/api/v1/me/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ provider, secret }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as {
          errors?: { message: string }[];
        };
        setError(body.errors?.[0]?.message ?? `HTTP ${r.status}`);
        return;
      }
      const body = (await r.json()) as {
        data: { provider: string; key_hint: string };
      };
      setKeys((prev) => [
        // If we re-saved the same provider, replace the row.
        ...prev.filter((k) => k.provider !== body.data.provider),
        {
          id: `tmp-${Date.now()}`,
          provider: body.data.provider,
          key_hint: body.data.key_hint,
          last_used_at: null,
          created_at: new Date().toISOString(),
        },
      ]);
      setLastAdded(body.data.provider);
      setSecret("");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string, provider: string) {
    if (!confirm(`Forget your ${provider} key? Tools using it will fail.`))
      return;
    const r = await fetch(`/api/v1/me/api-keys/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!r.ok) {
      setError(`HTTP ${r.status}`);
      return;
    }
    setKeys((prev) => prev.filter((k) => k.id !== id));
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="overflow-hidden rounded border border-border bg-bg-1">
        <header className="flex items-center gap-1.5 border-b border-border bg-bg-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-3">
          <Plus className="h-2.5 w-2.5" />
          Add or replace a key
        </header>
        <form onSubmit={add} className="flex flex-col gap-3 px-4 py-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-text-3">
              Provider
            </span>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="rounded-sm border border-border bg-bg-2 px-2 py-1.5 text-sm text-text-0 outline-none focus:border-border-focus"
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-text-3">
              Secret
            </span>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="sk-…"
              required
              className="rounded-sm border border-border bg-bg-0 px-3 py-1.5 font-mono text-sm text-text-0 outline-none focus:border-border-focus"
            />
            <span className="text-[10px] text-text-3">
              Stored AES-256-GCM encrypted. Not shown back after save.
            </span>
          </label>
          <div className="flex items-center justify-between">
            {lastAdded ? (
              <span className="flex items-center gap-1 text-xs text-success">
                <Check className="h-3 w-3" /> {lastAdded} key saved
              </span>
            ) : error ? (
              <span className="flex items-center gap-1 text-xs text-danger">
                <AlertCircle className="h-3 w-3" /> {error}
              </span>
            ) : (
              <span />
            )}
            <button
              type="submit"
              disabled={saving || !secret}
              className={cn(
                "rounded-sm border border-accent bg-accent px-3 py-1 text-xs font-semibold uppercase tracking-wide text-bg-0 hover:bg-accent-hover",
                (saving || !secret) && "cursor-not-allowed opacity-50",
              )}
            >
              {saving ? "Saving…" : "Save key"}
            </button>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded border border-border bg-bg-1">
        <header className="flex items-center gap-1.5 border-b border-border bg-bg-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-3">
          <Key className="h-2.5 w-2.5" />
          Stored keys
        </header>
        {keys.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-text-3">
            No keys yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {keys.map((k) => (
              <li
                key={k.id}
                className="flex items-center gap-3 px-4 py-2.5 text-sm"
              >
                <span className="flex-1 text-text-0">
                  <span className="capitalize">{k.provider}</span>
                  <span className="ml-2 font-mono text-[11px] text-text-3">
                    {k.key_hint}
                  </span>
                </span>
                <span className="text-[11px] text-text-3">
                  {k.last_used_at
                    ? `last used ${relative(k.last_used_at)}`
                    : "never used"}
                </span>
                <button
                  type="button"
                  onClick={() => void remove(k.id, k.provider)}
                  aria-label="Remove key"
                  className="rounded p-1 text-text-3 hover:bg-bg-3 hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function relative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / (60 * 24))}d ago`;
}
