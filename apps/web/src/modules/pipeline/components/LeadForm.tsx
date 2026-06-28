"use client";

import { useState } from "react";
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

function fieldInputType(t: PipelineField["type"]): string {
  if (t === "currency" || t === "number") return "number";
  if (t === "date") return "date";
  return "text";
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

  function setAttr(key: string, val: string) {
    setAttrs((prev) => ({ ...prev, [key]: val }));
  }

  function submit() {
    const patch: LeadInput = {
      name: name.trim(),
      subtitle: subtitle.trim() || null,
      stage,
      priority,
      source: source.trim() || null,
      next_follow_up_at: followUp ? new Date(followUp).toISOString() : null,
      attributes: attrs,
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

      {pipeline.fields.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border/40 pt-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-text-2">
            {pipeline.name} fields
          </span>
          <div className="grid grid-cols-2 gap-2">
            {pipeline.fields.map((f) => (
              <div key={f.key}>
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
        </div>
      )}

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
