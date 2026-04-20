"use client";

import { useMemo, useState } from "react";
import { Plus, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BudgetRow {
  id: string;
  category: string;
  description: string | null;
  amount_cents: number;
  currency: string;
  status: "planned" | "committed" | "paid" | "cancelled";
  incurred_on: string | null;
  vendor_id: string | null;
  created_at: string;
}

const STATUSES: Array<BudgetRow["status"]> = [
  "planned",
  "committed",
  "paid",
  "cancelled",
];

export function BudgetClient({
  ticker,
  initial,
  vendors,
}: {
  ticker: string;
  initial: BudgetRow[];
  vendors: Array<{ id: string; name: string }>;
}) {
  const [rows, setRows] = useState<BudgetRow[]>(initial);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<BudgetRow["status"]>("planned");
  const [vendorId, setVendorId] = useState<string>("");
  const [incurredOn, setIncurredOn] = useState("");

  const rollup = useMemo(() => summarize(rows), [rows]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const cents = Math.round(parseFloat(amount || "0") * 100);
      const r = await fetch(`/api/v1/projects/${ticker}/budget`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          category,
          description,
          amount_cents: cents,
          status,
          vendor_id: vendorId || undefined,
          incurred_on: incurredOn || undefined,
        }),
      });
      if (!r.ok) {
        const b = (await r.json().catch(() => ({}))) as {
          errors?: { message: string }[];
        };
        setError(b.errors?.[0]?.message ?? `HTTP ${r.status}`);
        return;
      }
      const b = (await r.json()) as { data: BudgetRow };
      setRows((prev) => [b.data, ...prev]);
      setCategory("");
      setDescription("");
      setAmount("");
      setVendorId("");
      setIncurredOn("");
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        {STATUSES.map((s) => (
          <div
            key={s}
            className="flex flex-col gap-0.5 rounded border border-border bg-bg-1 p-3"
          >
            <span className="text-[10px] uppercase tracking-wide text-text-3">
              {s}
            </span>
            <span className="font-mono text-lg tabular-nums text-text-0">
              {formatMoney(rollup[s] ?? 0)}
            </span>
          </div>
        ))}
      </section>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-0">Items</h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-sm border border-accent bg-accent-subtle px-2.5 py-1 text-xs font-semibold uppercase text-accent hover:bg-accent/20"
        >
          <Plus className="h-3 w-3" /> {open ? "Cancel" : "New item"}
        </button>
      </div>

      {open ? (
        <form
          onSubmit={add}
          className="mb-4 grid grid-cols-1 gap-2 rounded border border-border bg-bg-1 p-3 md:grid-cols-2"
        >
          <Labelled label="Category">
            <input
              required
              maxLength={80}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Concrete, legal, marketing…"
              className="rounded-sm border border-border bg-bg-0 px-2 py-1 text-sm text-text-0 outline-none focus:border-border-focus"
            />
          </Labelled>
          <Labelled label="Amount (USD)">
            <input
              required
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="rounded-sm border border-border bg-bg-0 px-2 py-1 text-sm text-text-0 outline-none focus:border-border-focus"
            />
          </Labelled>
          <Labelled label="Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as BudgetRow["status"])}
              className="rounded-sm border border-border bg-bg-2 px-2 py-1 text-sm text-text-0 outline-none focus:border-border-focus"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Labelled>
          <Labelled label="Vendor (optional)">
            <select
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              className="rounded-sm border border-border bg-bg-2 px-2 py-1 text-sm text-text-0 outline-none focus:border-border-focus"
            >
              <option value="">—</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </Labelled>
          <Labelled label="Incurred on (optional)">
            <input
              type="date"
              value={incurredOn}
              onChange={(e) => setIncurredOn(e.target.value)}
              className="rounded-sm border border-border bg-bg-0 px-2 py-1 font-mono text-sm text-text-0 outline-none focus:border-border-focus"
            />
          </Labelled>
          <Labelled label="Description (optional)">
            <input
              maxLength={400}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-sm border border-border bg-bg-0 px-2 py-1 text-sm text-text-0 outline-none focus:border-border-focus"
            />
          </Labelled>
          <div className="md:col-span-2 flex items-center justify-end gap-2">
            {error ? (
              <span className="text-xs text-danger">{error}</span>
            ) : null}
            <button
              type="submit"
              disabled={saving}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm border border-accent bg-accent px-3 py-1 text-xs font-semibold uppercase text-bg-0 hover:bg-accent-hover",
                saving && "cursor-not-allowed opacity-60",
              )}
            >
              <Check className="h-3 w-3" /> {saving ? "Adding…" : "Add"}
            </button>
          </div>
        </form>
      ) : null}

      <div className="overflow-hidden rounded border border-border bg-bg-1">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-bg-2 text-[10px] uppercase tracking-wide text-text-3">
              <th className="px-3 py-2 text-left font-semibold">Category</th>
              <th className="px-3 py-2 text-left font-semibold">Description</th>
              <th className="px-3 py-2 text-right font-semibold">Amount</th>
              <th className="px-3 py-2 text-left font-semibold">Status</th>
              <th className="px-3 py-2 text-left font-semibold">Incurred</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-xs text-text-3"
                >
                  No budget items yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="hover:bg-bg-2">
                  <td className="px-3 py-1.5 text-text-0">{r.category}</td>
                  <td className="px-3 py-1.5 text-xs text-text-2">
                    {r.description ?? ""}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-text-1">
                    {formatMoney(r.amount_cents, r.currency)}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[11px] uppercase text-text-3">
                    {r.status}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-text-3">
                    {r.incurred_on ?? ""}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Labelled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-text-3">
        {label}
      </span>
      {children}
    </label>
  );
}

function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function summarize(rows: BudgetRow[]): Record<BudgetRow["status"], number> {
  const out: Record<BudgetRow["status"], number> = {
    planned: 0,
    committed: 0,
    paid: 0,
    cancelled: 0,
  };
  for (const r of rows) out[r.status] += r.amount_cents;
  return out;
}
