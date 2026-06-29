"use client";

import { useState } from "react";
import { X, Plus, Trash2, ChevronUp, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { PipelineRow, PipelineField, PipelineFieldType } from "@/lib/pipeline/db";
import { slugifyKey, uniqueKey } from "@/lib/pipeline/fields";
import { updatePipeline } from "../lib/client-api";

const TYPES: { v: PipelineFieldType; label: string }[] = [
  { v: "text", label: "Text" },
  { v: "number", label: "Number" },
  { v: "currency", label: "Currency" },
  { v: "date", label: "Date" },
  { v: "select", label: "Select" },
  { v: "url", label: "URL" },
];

const input =
  "w-full rounded border border-border bg-bg-2 px-2 py-1 text-xs text-text-1 placeholder:text-text-3 outline-none focus:border-border-focus";
const select =
  "rounded border border-border bg-bg-2 px-1 py-1 text-2xs text-text-2 outline-none focus:border-border-focus";

interface Row {
  key: string; // "" for a new field; assigned on save
  label: string;
  type: PipelineFieldType;
  group: string;
  optionsText: string;
}

function fromField(f: PipelineField): Row {
  return {
    key: f.key,
    label: f.label,
    type: f.type,
    group: f.group ?? "",
    optionsText: (f.options ?? []).join(", "),
  };
}

/** Add / remove / rename / reorder the lead fields on a pipeline. Saving marks
 *  the pipeline customized so template sync no longer overwrites it. */
export function FieldsEditor({
  pipeline,
  onClose,
  onSaved,
}: {
  pipeline: PipelineRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(pipeline.fields.map(fromField));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch(i: number, p: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, { key: "", label: "", type: "text", group: "", optionsText: "" }]);
  }
  function removeRow(i: number) {
    setRows((rs) => rs.filter((_, idx) => idx !== i));
  }
  function move(i: number, dir: -1 | 1) {
    setRows((rs) => {
      const j = i + dir;
      if (j < 0 || j >= rs.length) return rs;
      const next = [...rs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const taken = new Set<string>();
      const fields: PipelineField[] = rows
        .filter((r) => r.label.trim())
        .map((r) => {
          let key = r.key || slugifyKey(r.label);
          key = uniqueKey(key, taken);
          taken.add(key);
          const field: PipelineField = { key, label: r.label.trim(), type: r.type };
          if (r.group.trim()) field.group = r.group.trim();
          if (r.type === "select") {
            field.options = r.optionsText
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
          }
          return field;
        });
      await updatePipeline(pipeline.id, { fields });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save fields");
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="mt-6 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-bg-1 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-text-3">
            Lead fields · {pipeline.name}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto rounded-sm p-1 text-text-2 hover:text-text-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="flex flex-col gap-1.5">
            {/* header row */}
            <div className="flex items-center gap-1 px-1 text-[9px] uppercase tracking-wide text-text-3">
              <span className="w-8" />
              <span className="flex-1">Label</span>
              <span className="w-[72px]">Type</span>
              <span className="w-[88px]">Section</span>
              <span className="w-5" />
            </div>
            {rows.map((r, i) => (
              <div key={i} className="flex flex-col gap-1 rounded border border-border/50 p-1.5">
                <div className="flex items-center gap-1">
                  <div className="flex w-8 flex-col">
                    <button
                      type="button"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      aria-label="Move up"
                      className="text-text-3 hover:text-text-0 disabled:opacity-25"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, 1)}
                      disabled={i === rows.length - 1}
                      aria-label="Move down"
                      className="text-text-3 hover:text-text-0 disabled:opacity-25"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>
                  <input
                    className={`${input} flex-1`}
                    placeholder="Field label"
                    value={r.label}
                    onChange={(e) => patch(i, { label: e.target.value })}
                  />
                  <select
                    className={`${select} w-[72px]`}
                    value={r.type}
                    onChange={(e) => patch(i, { type: e.target.value as PipelineFieldType })}
                  >
                    {TYPES.map((t) => (
                      <option key={t.v} value={t.v}>{t.label}</option>
                    ))}
                  </select>
                  <input
                    className={`${input} w-[88px]`}
                    placeholder="Section"
                    value={r.group}
                    onChange={(e) => patch(i, { group: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    aria-label="Remove field"
                    className="rounded-sm p-0.5 text-text-3 hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {r.type === "select" && (
                  <input
                    className={input}
                    placeholder="Options, comma-separated"
                    value={r.optionsText}
                    onChange={(e) => patch(i, { optionsText: e.target.value })}
                  />
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addRow}
              className="flex items-center gap-1 self-start text-2xs text-text-3 hover:text-text-1"
            >
              <Plus className="h-3 w-3" /> Add field
            </button>
          </div>

          {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
        </div>

        <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-border px-3 py-2">
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={busy}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Save fields
          </Button>
        </div>
      </div>
    </div>
  );
}
