"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  RefreshCw,
  RotateCcw,
  X,
} from "lucide-react";
import {
  AdminBadge,
  AdminButton,
  AdminEmpty,
  AdminPanel,
  AdminTable,
  AdminTd,
  AdminTh,
} from "@/components/admin/primitives";

interface SlowQueryRow {
  query: string;
  calls: number;
  mean_exec_time: number;
  total_exec_time: number;
  rows: number;
}

type SortKey = keyof SlowQueryRow;
type SortDir = "asc" | "desc";

const COLUMNS: Array<{ key: SortKey; label: string; align?: "right" }> = [
  { key: "query", label: "Query" },
  { key: "calls", label: "Calls", align: "right" },
  { key: "mean_exec_time", label: "Mean (ms)", align: "right" },
  { key: "total_exec_time", label: "Total (ms)", align: "right" },
  { key: "rows", label: "Rows", align: "right" },
];

export function PerfClient() {
  const [rows, setRows] = useState<SlowQueryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("mean_exec_time");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [explain, setExplain] = useState<{
    open: boolean;
    query: string;
    plan: string | null;
    error: string | null;
    loading: boolean;
  }>({ open: false, query: "", plan: null, error: null, loading: false });

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/v1/admin/perf/slow-queries", { credentials: "include" })
      .then((r) => r.json())
      .then(
        (body: { data?: SlowQueryRow[]; errors?: { message: string }[] }) => {
          if (body.errors?.[0]) {
            setError(body.errors[0].message);
            setRows([]);
            return;
          }
          setRows(body.data ?? []);
        },
      )
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "load failed"),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function flash(m: string) {
    setSuccess(m);
    setTimeout(() => setSuccess(null), 4000);
  }

  async function reset() {
    if (
      !confirm(
        "Reset pg_stat_statements? All accumulated query stats are wiped immediately.",
      )
    )
      return;
    setError(null);
    const r = await fetch("/api/v1/admin/perf/reset", {
      method: "POST",
      credentials: "include",
    });
    if (!r.ok) {
      const body = (await r.json().catch(() => ({}))) as {
        errors?: { message: string }[];
      };
      setError(body.errors?.[0]?.message ?? `HTTP ${r.status}`);
      return;
    }
    flash("pg_stat_statements reset.");
    load();
  }

  async function openExplain(query: string) {
    setExplain({
      open: true,
      query,
      plan: null,
      error: null,
      loading: true,
    });
    try {
      const r = await fetch("/api/v1/admin/perf/explain", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const body = (await r.json()) as {
        data?: { plan: string };
        errors?: { message: string }[];
      };
      if (!r.ok || body.errors?.[0]) {
        setExplain((s) => ({
          ...s,
          loading: false,
          error: body.errors?.[0]?.message ?? `HTTP ${r.status}`,
        }));
        return;
      }
      setExplain((s) => ({
        ...s,
        loading: false,
        plan: body.data?.plan ?? "",
      }));
    } catch (e: unknown) {
      setExplain((s) => ({
        ...s,
        loading: false,
        error: e instanceof Error ? e.message : "explain failed",
      }));
    }
  }

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === "number" && typeof bv === "number") {
      return sortDir === "asc" ? av - bv : bv - av;
    }
    return sortDir === "asc"
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av));
  });

  function toggleSort(k: SortKey) {
    if (k === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir(k === "query" ? "asc" : "desc");
    }
  }

  return (
    <>
      <AdminPanel title="Maintenance">
        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <AdminButton onClick={load} disabled={loading}>
              <RefreshCw className="h-3 w-3" /> Refresh
            </AdminButton>
            <AdminButton variant="danger" onClick={reset}>
              <RotateCcw className="h-3 w-3" /> Reset stats
            </AdminButton>
            <span className="text-[11px] text-text-3">
              Reset wipes pg_stat_statements counters. Use after deploying
              an index or query fix to re-baseline.
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
        </div>
      </AdminPanel>

      <AdminPanel
        title={`Top ${rows.length} slow queries (sorted by ${COLUMNS.find((c) => c.key === sortKey)?.label})`}
      >
        {loading && rows.length === 0 ? (
          <AdminEmpty>Loading…</AdminEmpty>
        ) : rows.length === 0 ? (
          <AdminEmpty>
            No data. The pg_stat_statements view is empty (or the extension
            isn&apos;t enabled — see Maintenance above).
          </AdminEmpty>
        ) : (
          <AdminTable className="border-0">
            <thead>
              <tr className="border-b border-border bg-bg-2">
                {COLUMNS.map((c) => (
                  <SortableTh
                    key={c.key}
                    active={sortKey === c.key}
                    dir={sortDir}
                    align={c.align}
                    onClick={() => toggleSort(c.key)}
                  >
                    {c.label}
                  </SortableTh>
                ))}
                <AdminTh>Plan</AdminTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((r, i) => (
                <tr key={`${r.query.slice(0, 80)}-${i}`} className="hover:bg-bg-2">
                  <AdminTd mono>
                    <span className="block max-w-[640px] truncate" title={r.query}>
                      {r.query}
                    </span>
                  </AdminTd>
                  <AdminTd align="right" mono>
                    {r.calls.toLocaleString()}
                  </AdminTd>
                  <AdminTd align="right" mono>
                    <Severity ms={r.mean_exec_time} />
                  </AdminTd>
                  <AdminTd align="right" mono>
                    {r.total_exec_time.toFixed(1)}
                  </AdminTd>
                  <AdminTd align="right" mono>
                    {r.rows.toLocaleString()}
                  </AdminTd>
                  <AdminTd>
                    <AdminButton
                      variant="subtle"
                      onClick={() => void openExplain(r.query)}
                    >
                      EXPLAIN
                    </AdminButton>
                  </AdminTd>
                </tr>
              ))}
            </tbody>
          </AdminTable>
        )}
      </AdminPanel>

      {explain.open ? (
        <ExplainModal
          state={explain}
          onClose={() =>
            setExplain({
              open: false,
              query: "",
              plan: null,
              error: null,
              loading: false,
            })
          }
        />
      ) : null}
    </>
  );
}

function SortableTh({
  children,
  active,
  dir,
  align,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  dir: SortDir;
  align?: "right";
  onClick: () => void;
}) {
  return (
    <AdminTh align={align}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 ${
          align === "right" ? "ml-auto" : ""
        } ${active ? "text-text-0" : "text-text-3"} hover:text-text-0`}
      >
        {children}
        {active ? (
          dir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : null}
      </button>
    </AdminTh>
  );
}

function Severity({ ms }: { ms: number }) {
  const variant: "muted" | "warning" | "danger" =
    ms >= 500 ? "danger" : ms >= 100 ? "warning" : "muted";
  return <AdminBadge variant={variant}>{ms.toFixed(2)}</AdminBadge>;
}

function ExplainModal({
  state,
  onClose,
}: {
  state: {
    query: string;
    plan: string | null;
    error: string | null;
    loading: boolean;
  };
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Query plan"
      className="fixed inset-0 z-50 flex items-start justify-center bg-bg-0/80 p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded border border-border bg-bg-1">
        <header className="flex items-center justify-between border-b border-border bg-bg-2 px-4 py-2">
          <h2 className="font-mono text-xs uppercase tracking-wide text-text-2">
            EXPLAIN — placeholders substituted with NULL
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-sm p-1 text-text-3 hover:bg-bg-3 hover:text-text-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>
        <div className="flex-1 overflow-auto p-4">
          <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-3">
            Query
          </h3>
          <pre className="mb-4 whitespace-pre-wrap break-all rounded border border-border bg-bg-0 p-3 font-mono text-xs text-text-1">
            {state.query}
          </pre>
          <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-3">
            Plan
          </h3>
          {state.loading ? (
            <p className="rounded border border-dashed border-border bg-bg-0 p-4 text-xs text-text-3">
              Running EXPLAIN…
            </p>
          ) : state.error ? (
            <p className="rounded border border-danger/40 bg-danger-subtle p-3 text-xs text-danger">
              {state.error}
            </p>
          ) : (
            <pre className="whitespace-pre-wrap rounded border border-border bg-bg-0 p-3 font-mono text-xs text-text-1">
              {state.plan ?? "(empty)"}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
