"use client";

import { useEffect, useState, useCallback } from "react";
import { Trash2, Search, AlertCircle, Check } from "lucide-react";
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
  bucket: string;
  token: string;
  count: number;
  latest: string;
}

const RANGES = [
  { id: "60", label: "Last 1h" },
  { id: "360", label: "Last 6h" },
  { id: "1440", label: "Last 24h" },
];

export function AdminRateLimitsClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [bucketFilter, setBucketFilter] = useState("");
  const [tokenFilter, setTokenFilter] = useState("");
  const [rangeMins, setRangeMins] = useState("60");

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (bucketFilter) params.set("bucket", bucketFilter);
    if (tokenFilter) params.set("token", tokenFilter);
    const since = new Date(
      Date.now() - parseInt(rangeMins, 10) * 60 * 1000,
    ).toISOString();
    params.set("since", since);
    fetch(`/api/v1/admin/rate-limits?${params.toString()}`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((b: { data?: Row[] }) => setRows(b.data ?? []))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "load failed"),
      );
  }, [bucketFilter, tokenFilter, rangeMins]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  function flash(m: string) {
    setSuccess(m);
    setTimeout(() => setSuccess(null), 2500);
  }

  async function flush(bucket: string, token: string) {
    if (!confirm(`Flush ${bucket} hits for ${token}?`)) return;
    const key = `${bucket}|${token}`;
    setBusy(key);
    try {
      const r = await fetch(
        `/api/v1/admin/rate-limits?bucket=${encodeURIComponent(bucket)}&token=${encodeURIComponent(token)}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!r.ok) {
        setError(await msg(r));
        return;
      }
      flash("Flushed");
      load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded border border-border bg-bg-1 p-2">
        <div className="flex items-center gap-2 rounded-sm border border-border bg-bg-0 px-2 py-1.5">
          <Search className="h-3.5 w-3.5 text-text-3" />
          <input
            value={bucketFilter}
            onChange={(e) => setBucketFilter(e.target.value)}
            placeholder="bucket"
            className="w-32 bg-transparent text-sm text-text-0 placeholder:text-text-3 outline-none"
          />
        </div>
        <div className="flex items-center gap-2 rounded-sm border border-border bg-bg-0 px-2 py-1.5">
          <Search className="h-3.5 w-3.5 text-text-3" />
          <input
            value={tokenFilter}
            onChange={(e) => setTokenFilter(e.target.value)}
            placeholder="token (ip / email)"
            className="w-64 bg-transparent text-sm text-text-0 placeholder:text-text-3 outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRangeMins(r.id)}
              className={`rounded-sm border px-2 py-1 font-mono text-[11px] uppercase tracking-wide ${
                rangeMins === r.id
                  ? "border-accent bg-accent-subtle text-accent"
                  : "border-border bg-bg-2 text-text-2 hover:bg-bg-3"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-text-3">
          {rows.length} buckets
        </span>
      </div>

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
        <AdminEmpty>No hits in the selected window.</AdminEmpty>
      ) : (
        <AdminPanel>
          <AdminTable className="border-0">
            <thead>
              <tr className="border-b border-border bg-bg-2">
                <AdminTh>Bucket</AdminTh>
                <AdminTh>Token</AdminTh>
                <AdminTh align="right">Count</AdminTh>
                <AdminTh>Latest</AdminTh>
                <AdminTh align="right">Actions</AdminTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={`${r.bucket}|${r.token}`}>
                  <AdminTd>
                    <AdminBadge>{r.bucket}</AdminBadge>
                  </AdminTd>
                  <AdminTd mono>{r.token}</AdminTd>
                  <AdminTd align="right" mono>
                    {r.count}
                  </AdminTd>
                  <AdminTd>
                    <span className="text-xs text-text-3">
                      {new Date(r.latest).toLocaleString()}
                    </span>
                  </AdminTd>
                  <AdminTd align="right">
                    <AdminButton
                      variant="danger"
                      onClick={() => void flush(r.bucket, r.token)}
                      disabled={busy === `${r.bucket}|${r.token}`}
                    >
                      <Trash2 className="h-3 w-3" /> Flush
                    </AdminButton>
                  </AdminTd>
                </tr>
              ))}
            </tbody>
          </AdminTable>
        </AdminPanel>
      )}
    </>
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
