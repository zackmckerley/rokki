"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/Dialog";
import { Input } from "@/components/ui/Input";
import { FormError } from "@/components/ui/FormError";

interface TokenRow {
  id: string;
  name: string;
  token_prefix: string;
  scopes: ("read" | "write" | "admin")[];
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
}

type CreatedToken = TokenRow & { token: string };

export function TokensClient() {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [justCreated, setJustCreated] = useState<CreatedToken | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/v1/me/tokens", { credentials: "include" });
    const body = (await r.json()) as { data?: TokenRow[] };
    setTokens(body.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function revoke(id: string) {
    if (!confirm("Revoke this token? Clients using it will disconnect within 30s."))
      return;
    const r = await fetch(`/api/v1/me/tokens/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (r.ok) await load();
  }

  const active = tokens.filter((t) => !t.revoked_at);

  return (
    <>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-3">
            Your tokens
          </h2>
          <Button variant="accent" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> New token
          </Button>
        </div>

        {loading ? (
          <Skeleton />
        ) : active.length === 0 ? (
          <EmptyState onCreate={() => setCreateOpen(true)} />
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded border border-border bg-bg-1">
            {active.map((t) => (
              <TokenRow key={t.id} token={t} onRevoke={() => revoke(t.id)} />
            ))}
          </div>
        )}
      </section>

      <CreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(created) => {
          setJustCreated(created);
          setCreateOpen(false);
          void load();
        }}
      />

      <RevealDialog
        created={justCreated}
        onClose={() => setJustCreated(null)}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */

function TokenRow({ token, onRevoke }: { token: TokenRow; onRevoke: () => void }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm text-text-0">{token.name}</p>
        <p className="font-mono text-xs text-text-3">
          {token.token_prefix}…… ·{" "}
          {token.scopes.map((s) => s.toUpperCase()).join(", ")}
        </p>
      </div>
      <div className="text-right text-xs text-text-3">
        <div>
          {token.last_used_at ? `Last used ${relative(token.last_used_at)}` : "Never used"}
        </div>
        <div>
          {token.expires_at ? `Expires ${relative(token.expires_at)}` : "No expiry"}
        </div>
      </div>
      <button
        onClick={onRevoke}
        aria-label="Revoke"
        className="rounded-sm p-1 text-text-3 hover:bg-bg-3 hover:text-danger"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="divide-y divide-border rounded border border-border bg-bg-1">
      {[0, 1].map((i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <div className="flex-1 space-y-2">
            <span className="block h-3 w-32 rounded-sm bg-bg-3" />
            <span className="block h-2 w-48 rounded-sm bg-bg-3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded border border-border bg-bg-1 p-8 text-center">
      <p className="text-sm text-text-1">No tokens yet.</p>
      <p className="mt-1 text-xs text-text-3">
        Create one to let your Claude / ChatGPT read this account.
      </p>
      <Button variant="accent" className="mt-4" onClick={onCreate}>
        Create token
      </Button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function CreateDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (t: CreatedToken) => void;
}) {
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"read" | "write">("write");
  const [expiresDays, setExpiresDays] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setScope("write");
      setExpiresDays(null);
      setError("");
      setSubmitted(false);
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!name.trim()) return;
    setLoading(true);
    setError("");
    const r = await fetch("/api/v1/me/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        scopes: scope === "write" ? ["read", "write"] : ["read"],
        expires_in_days: expiresDays ?? undefined,
      }),
      credentials: "include",
    });
    const body = (await r.json()) as {
      data?: CreatedToken;
      errors?: { message: string }[];
    };
    setLoading(false);
    if (!r.ok || !body.data) {
      setError(body.errors?.[0]?.message ?? "Could not create token");
      return;
    }
    onCreated(body.data);
  }

  return (
    <Dialog open={open} onClose={onClose} title="New AI token">
      <form onSubmit={submit} className="space-y-3" noValidate>
        <FormError message={error} />
        <Input
          name="name"
          label="Name"
          placeholder="My Claude Desktop"
          hint="Just so you remember which device this is for."
          autoFocus
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={!name.trim() && submitted ? "Required" : undefined}
        />

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-1">Scope</label>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as "read" | "write")}
            className="h-9 rounded border border-border bg-bg-2 px-3 text-sm text-text-0 focus:border-border-focus focus:outline-none"
          >
            <option value="write">Read + write — AI can create and update</option>
            <option value="read">Read only — AI can query but not change</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-1">Expires</label>
          <select
            value={expiresDays ?? ""}
            onChange={(e) =>
              setExpiresDays(e.target.value ? Number(e.target.value) : null)
            }
            className="h-9 rounded border border-border bg-bg-2 px-3 text-sm text-text-0 focus:border-border-focus focus:outline-none"
          >
            <option value="">Never</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="365">1 year</option>
          </select>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="accent" loading={loading}>
            Create
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */

function RevealDialog({
  created,
  onClose,
}: {
  created: CreatedToken | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!created) setCopied(false);
  }, [created]);

  if (!created) return null;

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be blocked; fallback is selecting text manually
    }
  }

  const origin =
    typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const mcpUrl =
    process.env.NEXT_PUBLIC_MCP_URL ??
    `${origin.replace(/:\d+$/, "")}:3001/v1/sse`;

  const claudeConfig = JSON.stringify(
    {
      mcpServers: {
        rokki: {
          transport: "sse",
          url: mcpUrl,
          headers: { Authorization: `Bearer ${created.token}` },
        },
      },
    },
    null,
    2,
  );

  return (
    <Dialog
      open={!!created}
      onClose={onClose}
      title="Your token"
      className="max-w-xl"
    >
      <div className="space-y-4">
        <div className="rounded border border-warning bg-warning-subtle p-3 text-xs text-warning">
          Copy this token now. It&apos;s shown once and never again. If you
          lose it, revoke this one and create a new token.
        </div>

        <div className="flex items-center gap-2 rounded border border-border bg-bg-2 px-3 py-2">
          <code className="flex-1 overflow-x-auto font-mono text-xs text-text-0">
            {created.token}
          </code>
          <button
            onClick={copy}
            className="rounded-sm px-2 py-1 text-xs text-text-2 hover:bg-bg-3 hover:text-text-0"
          >
            {copied ? (
              <span className="flex items-center gap-1 text-success">
                <Check className="h-3 w-3" /> Copied
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <Copy className="h-3 w-3" /> Copy
              </span>
            )}
          </button>
        </div>

        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-3">
            Paste into Claude Desktop config
          </h3>
          <pre className="overflow-x-auto rounded border border-border bg-bg-2 p-3 font-mono text-xs text-text-1">
{claudeConfig}
          </pre>
          <p className="mt-2 text-xs text-text-3">
            On macOS: <span className="font-mono">~/Library/Application Support/Claude/claude_desktop_config.json</span>.
            Restart Claude Desktop after saving.
          </p>
        </div>

        <div className="flex justify-end">
          <Button variant="accent" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function relative(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(ms);
  const d = Math.floor(abs / 86400_000);
  if (d > 0) return ms > 0 ? `in ${d}d` : `${d}d ago`;
  const h = Math.floor(abs / 3600_000);
  if (h > 0) return ms > 0 ? `in ${h}h` : `${h}h ago`;
  const m = Math.floor(abs / 60_000);
  return ms > 0 ? `in ${m}m` : `${m}m ago`;
}
