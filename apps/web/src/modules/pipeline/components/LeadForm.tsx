"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { LeadRow, PipelineRow, PipelineField } from "@/lib/pipeline/db";
import type { LeadInput } from "../lib/client-api";

const input =
  "w-full rounded border border-border bg-bg-2 px-2 py-1 text-xs text-text-1 placeholder:text-text-3 outline-none focus:border-border-focus";
const select =
  "rounded border border-border bg-bg-2 px-1.5 py-1 text-xs text-text-2 outline-none focus:border-border-focus";
const label = "text-[10px] font-semibold uppercase tracking-wide text-text-3";

const PRIORITIES = [
  { v: 0, label: "—" },
  { v: 1, label: "Low" },
  { v: 2, label: "Med" },
  { v: 3, label: "High" },
];

const QC_ROLES = ["", "seller", "broker", "attorney", "title", "lender", "partner", "other"];
interface QuickContact {
  name: string;
  role?: string;
  phone?: string;
}

function fieldInputType(t: PipelineField["type"]): string {
  if (t === "currency" || t === "number") return "number";
  if (t === "date") return "date";
  if (t === "url") return "url";
  return "text";
}

/** Group fields by their `group` (preserving first-seen order). */
function groupFields(fields: PipelineField[]): { name: string; fields: PipelineField[] }[] {
  const order: string[] = [];
  const byGroup = new Map<string, PipelineField[]>();
  for (const f of fields) {
    const g = f.group ?? "Details";
    if (!byGroup.has(g)) {
      byGroup.set(g, []);
      order.push(g);
    }
    byGroup.get(g)!.push(f);
  }
  return order.map((name) => ({ name, fields: byGroup.get(name)! }));
}

/** Shared create/edit form for a lead. Renders the core fields + the pipeline's
 *  custom field schema (into `attributes`). */
export function LeadForm({
  pipeline,
  initial,
  busy,
  error,
  submitLabel,
  defaultStage,
  onCancel,
  onSubmit,
}: {
  pipeline: PipelineRow;
  initial?: Partial<LeadRow>;
  busy?: boolean;
  error?: string | null;
  submitLabel: string;
  defaultStage?: string;
  onCancel: () => void;
  onSubmit: (patch: LeadInput) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [subtitle, setSubtitle] = useState(initial?.subtitle ?? "");
  const [stage, setStage] = useState(
    initial?.stage ?? defaultStage ?? pipeline.stages[0]?.key ?? "",
  );
  const [priority, setPriority] = useState<number>(initial?.priority ?? 0);
  const [source, setSource] = useState(initial?.source ?? "");
  const [followUp, setFollowUp] = useState(
    (initial?.next_follow_up_at ?? "").slice(0, 10),
  );
  const [attrs, setAttrs] = useState<Record<string, unknown>>(
    (initial?.attributes as Record<string, unknown>) ?? {},
  );

  const groups = groupFields(pipeline.fields);
  // First group (Location) open; the rest collapsed so the form stays compact.
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(groups.slice(0, 1).map((g) => g.name)),
  );
  function toggleGroup(name: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function setAttr(key: string, val: string) {
    setAttrs((prev) => ({ ...prev, [key]: val }));
  }

  const quickContacts = (attrs.quick_contacts as QuickContact[] | undefined) ?? [];
  function setQuickContacts(next: QuickContact[]) {
    setAttrs((prev) => ({ ...prev, quick_contacts: next }));
  }
  function patchQC(i: number, p: Partial<QuickContact>) {
    setQuickContacts(quickContacts.map((q, idx) => (idx === i ? { ...q, ...p } : q)));
  }

  function submit() {
    const cleanAttrs = { ...attrs };
    if (Array.isArray(cleanAttrs.quick_contacts)) {
      cleanAttrs.quick_contacts = (cleanAttrs.quick_contacts as QuickContact[]).filter(
        (q) => q.name?.trim(),
      );
    }
    const patch: LeadInput = {
      name: name.trim(),
      subtitle: subtitle.trim() || null,
      stage,
      priority,
      source: source.trim() || null,
      next_follow_up_at: followUp ? new Date(followUp).toISOString() : null,
      attributes: cleanAttrs,
    };
    onSubmit(patch);
  }

  const canSubmit = !busy && Boolean(name.trim());

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className={label}>Name</label>
        <input
          className={input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="2510 SW 16 St"
          autoFocus
        />
      </div>
      <div>
        <label className={label}>Subtitle</label>
        <input
          className={input}
          value={subtitle}
          onChange={(e) => setSubtitle(e.target.value)}
          placeholder="Off-market · 4-unit"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={label}>Stage</label>
          <select
            className={`${select} w-full`}
            value={stage}
            onChange={(e) => setStage(e.target.value)}
          >
            {pipeline.stages.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Priority</label>
          <select
            className={`${select} w-full`}
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
          >
            {PRIORITIES.map((p) => (
              <option key={p.v} value={p.v}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={label}>Source</label>
          <input
            className={input}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="Broker, cold call…"
          />
        </div>
        <div>
          <label className={label}>Next follow-up</label>
          <input
            type="date"
            className={input}
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
          />
        </div>
      </div>

      {groups.map((g) => {
        const open = openGroups.has(g.name);
        return (
          <div key={g.name} className="border-t border-border/40 pt-2">
            <button
              type="button"
              onClick={() => toggleGroup(g.name)}
              aria-expanded={open}
              className="flex w-full items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-text-2 hover:text-text-0"
            >
              {open ? (
                <ChevronDown className="h-3 w-3" aria-hidden="true" />
              ) : (
                <ChevronRight className="h-3 w-3" aria-hidden="true" />
              )}
              {g.name}
            </button>
            {open && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {g.fields.map((f) => (
                  <div
                    key={f.key}
                    className={f.type === "url" || f.type === "address" ? "col-span-2" : ""}
                  >
                    <label className={label}>{f.label}</label>
                    {f.type === "select" ? (
                      <select
                        className={`${select} w-full`}
                        value={String(attrs[f.key] ?? "")}
                        onChange={(e) => setAttr(f.key, e.target.value)}
                      >
                        <option value="" />
                        {(f.options ?? []).map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={fieldInputType(f.type)}
                        className={input}
                        value={String(attrs[f.key] ?? "")}
                        onChange={(e) => setAttr(f.key, e.target.value)}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Quick contacts (free-text — for one-off names; link real Contacts in the drawer) */}
      <div className="flex flex-col gap-1.5 border-t border-border/40 pt-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-text-2">
          People (quick)
        </span>
        {quickContacts.map((qc, i) => (
          <div key={i} className="flex items-center gap-1">
            <input
              className={`${input} flex-1`}
              placeholder="Name"
              value={qc.name}
              onChange={(e) => patchQC(i, { name: e.target.value })}
            />
            <select
              className={select}
              value={qc.role ?? ""}
              onChange={(e) => patchQC(i, { role: e.target.value })}
            >
              {QC_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r || "role"}
                </option>
              ))}
            </select>
            <input
              className={`${input} max-w-[40%]`}
              placeholder="Phone / email"
              value={qc.phone ?? ""}
              onChange={(e) => patchQC(i, { phone: e.target.value })}
            />
            <button
              type="button"
              onClick={() => setQuickContacts(quickContacts.filter((_, idx) => idx !== i))}
              aria-label="Remove"
              className="rounded-sm p-0.5 text-text-3 hover:text-danger"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setQuickContacts([...quickContacts, { name: "" }])}
          className="flex items-center gap-1 self-start text-2xs text-text-3 hover:text-text-1"
        >
          <Plus className="h-3 w-3" /> Add person
        </button>
      </div>

      {/* Notes */}
      <div className="border-t border-border/40 pt-2">
        <label className={label}>Notes</label>
        <textarea
          className={`${input} min-h-[60px] resize-y`}
          value={String(attrs.notes ?? "")}
          onChange={(e) => setAttr("notes", e.target.value)}
        />
      </div>

      {error ? <p className="text-xs text-danger">{error}</p> : null}

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={!canSubmit}>
          {busy ? "Saving…" : submitLabel}
        </Button>
      </div>
    </div>
  );
}
