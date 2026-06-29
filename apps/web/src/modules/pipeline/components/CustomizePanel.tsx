"use client";

import { useState } from "react";
import { X, Plus, Trash2, ChevronUp, ChevronDown, Loader2, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type {
  PipelineRow,
  PipelineField,
  PipelineFieldType,
  PipelineStage,
} from "@/lib/pipeline/db";
import { slugifyKey, uniqueKey } from "@/lib/pipeline/fields";
import { CARD_FIELD_CAP } from "@/lib/pipeline/board";
import { updatePipeline } from "../lib/client-api";
import { useOverlay } from "../lib/use-overlay";

/**
 * One "Customize" panel for a pipeline — a single, unobtrusive entry point for
 * all of its optionality (keeps the board surface clean). Two tabs:
 *   • Stages — add / rename / recolor / reorder, set each stage's outcome
 *     (open · won · lost) and the one "go-hard" terminal gate, plus a
 *     going-cold threshold. The won/lost + gate semantics stay structural.
 *   • Fields — the lead form's custom fields (label / type / section / options).
 * Save persists both in one PATCH.
 */

const FIELD_TYPES: { v: PipelineFieldType; label: string }[] = [
  { v: "text", label: "Text" },
  { v: "number", label: "Number" },
  { v: "currency", label: "Currency" },
  { v: "date", label: "Date" },
  { v: "select", label: "Select" },
  { v: "url", label: "URL" },
];

const STAGE_TYPES: { v: PipelineStage["type"]; label: string }[] = [
  { v: "open", label: "Open" },
  { v: "won", label: "Won" },
  { v: "lost", label: "Lost" },
];

/** Muted stage swatches — color carries meaning sparingly. */
const STAGE_SWATCHES = ["#64748B", "#3B82F6", "#22C55E", "#EAB308", "#A855F7", "#EF4444"];

const input =
  "w-full rounded border border-border bg-bg-2 px-2 py-1 text-xs text-text-1 placeholder:text-text-3 outline-none focus:border-border-focus";
const select =
  "rounded border border-border bg-bg-2 px-1 py-1 text-2xs text-text-2 outline-none focus:border-border-focus";

interface FieldRow {
  key: string; // "" for a new field; assigned on save
  label: string;
  type: PipelineFieldType;
  group: string;
  optionsText: string;
  card: boolean;
}
interface StageRow {
  key: string; // "" for a new stage; assigned on save (existing keys are kept)
  label: string;
  color: string;
  type: PipelineStage["type"];
  gate: boolean;
  rottingDays: string;
}

function fieldToRow(f: PipelineField): FieldRow {
  return {
    key: f.key,
    label: f.label,
    type: f.type,
    group: f.group ?? "",
    optionsText: (f.options ?? []).join(", "),
    card: Boolean(f.card),
  };
}
function stageToRow(s: PipelineStage): StageRow {
  return {
    key: s.key,
    label: s.label,
    color: s.color ?? "",
    type: s.type,
    gate: Boolean(s.is_terminal_gate),
    rottingDays: s.rotting_days ? String(s.rotting_days) : "",
  };
}

export function CustomizePanel({
  pipeline,
  onClose,
  onSaved,
}: {
  pipeline: PipelineRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<"stages" | "fields">("stages");
  const [stages, setStages] = useState<StageRow[]>(pipeline.stages.map(stageToRow));
  const [fields, setFields] = useState<FieldRow[]>(pipeline.fields.map(fieldToRow));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useOverlay(true, onClose);

  // ── stage row ops ──────────────────────────────────────────────────
  function patchStage(i: number, p: Partial<StageRow>) {
    setStages((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  }
  function setGate(i: number) {
    // Single gate: setting one clears the rest.
    setStages((rs) => rs.map((r, idx) => ({ ...r, gate: idx === i ? !r.gate : false })));
  }
  function addStage() {
    setStages((rs) => [
      ...rs,
      { key: "", label: "", color: "", type: "open", gate: false, rottingDays: "" },
    ]);
  }
  function removeStage(i: number) {
    setStages((rs) => rs.filter((_, idx) => idx !== i));
  }
  function moveStage(i: number, dir: -1 | 1) {
    setStages((rs) => {
      const j = i + dir;
      if (j < 0 || j >= rs.length) return rs;
      const next = [...rs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  // ── field row ops ──────────────────────────────────────────────────
  function patchField(i: number, p: Partial<FieldRow>) {
    setFields((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  }
  function addField() {
    setFields((rs) => [
      ...rs,
      { key: "", label: "", type: "text", group: "", optionsText: "", card: false },
    ]);
  }
  function removeField(i: number) {
    setFields((rs) => rs.filter((_, idx) => idx !== i));
  }
  function moveField(i: number, dir: -1 | 1) {
    setFields((rs) => {
      const j = i + dir;
      if (j < 0 || j >= rs.length) return rs;
      const next = [...rs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function buildStages(): PipelineStage[] {
    const taken = new Set<string>();
    const out: PipelineStage[] = [];
    for (const r of stages) {
      if (!r.label.trim()) continue;
      let key = r.key || slugifyKey(r.label) || "stage";
      key = uniqueKey(key, taken);
      taken.add(key);
      const st: PipelineStage = { key, label: r.label.trim(), type: r.type };
      if (r.color) st.color = r.color;
      const rd = Number(r.rottingDays);
      if (r.rottingDays.trim() && Number.isFinite(rd) && rd > 0) st.rotting_days = rd;
      if (r.gate) st.is_terminal_gate = true;
      out.push(st);
    }
    return out;
  }

  function buildFields(): PipelineField[] {
    const taken = new Set<string>();
    return fields
      .filter((r) => r.label.trim())
      .map((r) => {
        let key = r.key || slugifyKey(r.label);
        key = uniqueKey(key, taken);
        taken.add(key);
        const field: PipelineField = { key, label: r.label.trim(), type: r.type };
        if (r.group.trim()) field.group = r.group.trim();
        if (r.card) field.card = true;
        if (r.type === "select") {
          field.options = r.optionsText
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        }
        return field;
      });
  }

  async function save() {
    const nextStages = buildStages();
    if (nextStages.length === 0) {
      setTab("stages");
      setError("A pipeline needs at least one stage.");
      return;
    }
    // A go-hard gate is structural — promotion to a Terminal depends on it.
    if (!nextStages.some((s) => s.is_terminal_gate)) {
      setTab("stages");
      setError("Mark one stage as the gate (the go-hard stage that promotes to a Terminal).");
      return;
    }
    // Cold thresholds must be positive day counts (the input can be coaxed
    // negative; don't silently drop it).
    const badCold = stages.find(
      (r) => r.label.trim() && r.rottingDays.trim() && !(Number(r.rottingDays) > 0),
    );
    if (badCold) {
      setTab("stages");
      setError("Cold thresholds must be a positive number of days.");
      return;
    }

    // Only send `fields` when they actually changed — otherwise a stage-only
    // edit would needlessly flip fields_customized and stop template field-sync.
    const nextFields = buildFields();
    const patch: Parameters<typeof updatePipeline>[1] = { stages: nextStages };
    if (JSON.stringify(nextFields) !== JSON.stringify(pipeline.fields)) {
      patch.fields = nextFields;
    }

    setBusy(true);
    setError(null);
    try {
      await updatePipeline(pipeline.id, patch);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Customize ${pipeline.name}`}
        className="mt-6 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-bg-1 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-text-3">
            Customize · {pipeline.name}
          </span>
          <div className="ml-auto flex items-center gap-0.5 rounded border border-border p-0.5">
            <TabButton active={tab === "stages"} onClick={() => setTab("stages")}>
              Stages
            </TabButton>
            <TabButton active={tab === "fields"} onClick={() => setTab("fields")}>
              Fields
            </TabButton>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-sm p-1 text-text-2 hover:text-text-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {tab === "stages" ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1 px-1 text-[9px] uppercase tracking-wide text-text-3">
                <span className="w-8" />
                <span className="flex-1">Stage</span>
                <span className="w-[64px]">Outcome</span>
                <span className="w-10 text-center" title="Cold after N idle days">
                  Cold
                </span>
                <span className="w-9 text-center" title="The go-hard gate that promotes to a Terminal">
                  Gate
                </span>
                <span className="w-5" />
              </div>
              {stages.map((r, i) => (
                <div key={i} className="flex items-center gap-1 rounded border border-border/50 p-1.5">
                  <ReorderButtons
                    i={i}
                    count={stages.length}
                    onUp={() => moveStage(i, -1)}
                    onDown={() => moveStage(i, 1)}
                  />
                  <div className="flex min-w-0 flex-1 items-center gap-1">
                    <ColorDot
                      value={r.color}
                      onChange={(c) => patchStage(i, { color: c })}
                    />
                    <input
                      className={`${input} flex-1`}
                      placeholder="Stage name"
                      value={r.label}
                      onChange={(e) => patchStage(i, { label: e.target.value })}
                    />
                  </div>
                  <select
                    aria-label="Outcome"
                    className={`${select} w-[64px]`}
                    value={r.type}
                    onChange={(e) =>
                      patchStage(i, { type: e.target.value as PipelineStage["type"] })
                    }
                  >
                    {STAGE_TYPES.map((t) => (
                      <option key={t.v} value={t.v}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    aria-label="Cold after days"
                    className={`${input} w-10 px-1 text-center`}
                    placeholder="—"
                    value={r.rottingDays}
                    onChange={(e) => patchStage(i, { rottingDays: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setGate(i)}
                    aria-label="Terminal gate"
                    aria-pressed={r.gate}
                    title="Reaching this stage promotes the lead to a Terminal"
                    className={`flex w-9 justify-center rounded-sm py-1 text-[9px] font-semibold uppercase tracking-wide ${
                      r.gate
                        ? "bg-accent/20 text-accent"
                        : "text-text-3 hover:text-text-1"
                    }`}
                  >
                    Gate
                  </button>
                  <button
                    type="button"
                    onClick={() => removeStage(i)}
                    aria-label="Remove stage"
                    className="rounded-sm p-0.5 text-text-3 hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addStage}
                className="flex items-center gap-1 self-start text-2xs text-text-3 hover:text-text-1"
              >
                <Plus className="h-3 w-3" /> Add stage
              </button>
              <p className="mt-1 text-[10px] text-text-3">
                Removing a stage moves its leads to an &ldquo;Unassigned&rdquo; column — drag
                them into a current stage.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1 px-1 text-[9px] uppercase tracking-wide text-text-3">
                <span className="w-8" />
                <span className="flex-1">Label</span>
                <span className="w-[72px]">Type</span>
                <span className="w-[88px]">Section</span>
                <span className="w-5" />
              </div>
              {fields.map((r, i) => (
                <div key={i} className="flex flex-col gap-1 rounded border border-border/50 p-1.5">
                  <div className="flex items-center gap-1">
                    <ReorderButtons
                      i={i}
                      count={fields.length}
                      onUp={() => moveField(i, -1)}
                      onDown={() => moveField(i, 1)}
                    />
                    <input
                      className={`${input} flex-1`}
                      placeholder="Field label"
                      value={r.label}
                      onChange={(e) => patchField(i, { label: e.target.value })}
                    />
                    <select
                      aria-label="Field type"
                      className={`${select} w-[72px]`}
                      value={r.type}
                      onChange={(e) =>
                        patchField(i, { type: e.target.value as PipelineFieldType })
                      }
                    >
                      {FIELD_TYPES.map((t) => (
                        <option key={t.v} value={t.v}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <input
                      className={`${input} w-[88px]`}
                      placeholder="Section"
                      value={r.group}
                      onChange={(e) => patchField(i, { group: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => patchField(i, { card: !r.card })}
                      aria-label="Show on card"
                      aria-pressed={r.card}
                      title="Show this field as a chip on the board card"
                      className={`rounded-sm p-0.5 ${
                        r.card ? "text-accent" : "text-text-3 hover:text-text-1"
                      }`}
                    >
                      <CreditCard className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeField(i)}
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
                      onChange={(e) => patchField(i, { optionsText: e.target.value })}
                    />
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addField}
                className="flex items-center gap-1 self-start text-2xs text-text-3 hover:text-text-1"
              >
                <Plus className="h-3 w-3" /> Add field
              </button>
              <p className="mt-1 flex items-center gap-1 text-[10px] text-text-3">
                <CreditCard className="h-3 w-3" /> shows a field on the board card
                — the first {CARD_FIELD_CAP} keep the card sparse.
              </p>
            </div>
          )}

          {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
        </div>

        <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-border px-3 py-2">
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={busy}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-sm px-2 py-0.5 text-2xs font-medium ${
        active ? "bg-bg-3 text-text-0" : "text-text-3 hover:text-text-1"
      }`}
    >
      {children}
    </button>
  );
}

function ReorderButtons({
  i,
  count,
  onUp,
  onDown,
}: {
  i: number;
  count: number;
  onUp: () => void;
  onDown: () => void;
}) {
  return (
    <div className="flex w-8 flex-col">
      <button
        type="button"
        onClick={onUp}
        disabled={i === 0}
        aria-label="Move up"
        className="text-text-3 hover:text-text-0 disabled:opacity-25"
      >
        <ChevronUp className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={onDown}
        disabled={i === count - 1}
        aria-label="Move down"
        className="text-text-3 hover:text-text-0 disabled:opacity-25"
      >
        <ChevronDown className="h-3 w-3" />
      </button>
    </div>
  );
}

/** A small colored dot that cycles through the stage palette on click. */
function ColorDot({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  const idx = STAGE_SWATCHES.indexOf(value);
  return (
    <button
      type="button"
      aria-label="Stage color"
      title="Click to change color"
      onClick={() => onChange(STAGE_SWATCHES[(idx + 1) % STAGE_SWATCHES.length])}
      className="h-3.5 w-3.5 flex-shrink-0 rounded-full border border-border"
      style={{ background: value || "var(--bg-3)" }}
    />
  );
}
