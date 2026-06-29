"use client";

import { useEffect, useState } from "react";
import { Plus, Loader2, X, Clock, Flame, LayoutGrid, List, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { LeadRow, PipelineRow } from "@/lib/pipeline/db";
import {
  groupByStage,
  isFollowUpDue,
  isRotting,
  rollupField,
  sumAttr,
  compactMoney,
} from "@/lib/pipeline/board";
import { PipelineList } from "./PipelineList";
import { FieldsEditor } from "./FieldsEditor";
import {
  getSpaces,
  getBoard,
  createLead,
  updateLead,
  type SpaceLite,
  type LeadInput,
} from "../lib/client-api";
import { LeadCard } from "./LeadCard";
import { LeadForm } from "./LeadForm";
import { LeadDetail } from "./LeadDetail";
import { useOverlay } from "../lib/use-overlay";

const SPACE_KEY = "rokki:pipeline-space";
const VIEW_KEY = "rokki:pipeline-view";

export function PipelineBoard() {
  const [spaces, setSpaces] = useState<SpaceLite[]>([]);
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [pipeline, setPipeline] = useState<PipelineRow | null>(null);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [view, setView] = useState<"board" | "list">("board");
  // One "now" for the whole tree, ticking each minute so "cold" / "follow-up
  // due" refresh on their own without a reload.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const saved =
      typeof window !== "undefined" ? window.localStorage.getItem(VIEW_KEY) : null;
    if (saved === "list" || saved === "board") setView(saved);
  }, []);
  function selectView(v: "board" | "list") {
    setView(v);
    if (typeof window !== "undefined") window.localStorage.setItem(VIEW_KEY, v);
  }

  const [selectedLead, setSelectedLead] = useState<string | null>(null);
  const [createStage, setCreateStage] = useState<string | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  // Esc closes whichever overlay is open (+ restores focus to the trigger).
  useOverlay(createStage != null, () => setCreateStage(null));
  useOverlay(selectedLead != null && createStage == null, () => setSelectedLead(null));

  // Spaces once.
  useEffect(() => {
    let alive = true;
    getSpaces()
      .then((sp) => {
        if (!alive) return;
        setSpaces(sp);
        const saved =
          typeof window !== "undefined" ? window.localStorage.getItem(SPACE_KEY) : null;
        const pick = saved && sp.some((s) => s.id === saved) ? saved : sp[0]?.id ?? null;
        setSpaceId(pick);
        if (!pick) setLoading(false);
      })
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  // Board when the space changes.
  useEffect(() => {
    if (!spaceId) return;
    let alive = true;
    setLoading(true);
    getBoard(spaceId)
      .then((b) => {
        if (!alive) return;
        setPipeline(b.pipeline);
        setLeads(b.leads);
        setError(null);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [spaceId]);

  function selectSpace(id: string) {
    setSpaceId(id);
    setSelectedLead(null);
    if (typeof window !== "undefined") window.localStorage.setItem(SPACE_KEY, id);
  }

  async function refresh() {
    if (!spaceId) return;
    const b = await getBoard(spaceId).catch(() => null);
    if (b) {
      setPipeline(b.pipeline);
      setLeads(b.leads);
    }
  }

  async function moveLead(leadId: string, stageKey: string) {
    if (!pipeline) return;
    const stage = pipeline.stages.find((s) => s.key === stageKey);
    if (!stage) return;
    const status: LeadRow["status"] | undefined =
      stage.type === "won" ? "won" : stage.type === "lost" ? "lost" : undefined;
    const prev = leads;
    setLeads((ls) =>
      ls.map((l) =>
        l.id === leadId ? { ...l, stage: stageKey, ...(status ? { status } : {}) } : l,
      ),
    );
    try {
      await updateLead(leadId, { stage: stageKey, ...(status ? { status } : {}) });
      void refresh();
    } catch {
      setLeads(prev); // revert on failure
    }
  }

  async function create(patch: LeadInput) {
    if (!pipeline || !spaceId) return;
    setCreateBusy(true);
    setCreateErr(null);
    try {
      const lead = await createLead({ ...patch, pipeline_id: pipeline.id, space_id: spaceId });
      setCreateStage(null);
      await refresh();
      // Open the new lead so people / parcels / files are right there.
      setSelectedLead(lead.id);
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : "Could not create");
    } finally {
      setCreateBusy(false);
    }
  }

  const stages = pipeline?.stages ?? [];
  const activeLeads = leads.filter(
    (l) => l.status !== "converted" && l.status !== "dead",
  );
  const needsAttention = (l: LeadRow) =>
    isFollowUpDue(l, nowMs) || isRotting(l, stages, nowMs);
  let fuCount = 0;
  let coldCount = 0;
  for (const l of activeLeads) {
    if (isFollowUpDue(l, nowMs)) fuCount++;
    if (isRotting(l, stages, nowMs)) coldCount++;
  }
  const visibleLeads = attentionOnly ? activeLeads.filter(needsAttention) : activeLeads;
  const { columns, orphans } = groupByStage(visibleLeads, stages);
  const rollup = pipeline ? rollupField(pipeline.fields) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Top bar */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        {spaces.length > 1 ? (
          <select
            value={spaceId ?? ""}
            onChange={(e) => selectSpace(e.target.value)}
            aria-label="Space"
            className="rounded border border-border bg-bg-2 px-1.5 py-1 text-xs text-text-1 outline-none focus:border-border-focus"
          >
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-xs font-semibold text-text-1">
            {pipeline?.name ?? "Pipeline"}
          </span>
        )}
        <span className="font-mono text-2xs text-text-3">{visibleLeads.length}</span>
        <div className="ml-auto flex items-center gap-0.5 rounded border border-border p-0.5">
          <button
            type="button"
            onClick={() => selectView("board")}
            aria-label="Board view"
            aria-pressed={view === "board"}
            className={`rounded-sm p-1 ${view === "board" ? "bg-bg-3 text-text-0" : "text-text-3 hover:text-text-1"}`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => selectView("list")}
            aria-label="List view"
            aria-pressed={view === "list"}
            className={`rounded-sm p-1 ${view === "list" ? "bg-bg-3 text-text-0" : "text-text-3 hover:text-text-1"}`}
          >
            <List className="h-3.5 w-3.5" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => setFieldsOpen(true)}
          aria-label="Edit fields"
          title="Add or remove lead fields"
          disabled={!pipeline}
          className="rounded-sm p-1 text-text-3 hover:bg-bg-2 hover:text-text-0 disabled:opacity-40"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
        </button>
        <Button
          size="sm"
          onClick={() => setCreateStage(pipeline?.stages[0]?.key ?? null)}
          disabled={!pipeline}
        >
          <Plus className="h-3 w-3" /> Lead
        </Button>
      </div>

      {/* Needs-attention strip — board view only */}
      {view === "board" && (fuCount > 0 || coldCount > 0) && (
        <button
          type="button"
          onClick={() => setAttentionOnly((a) => !a)}
          aria-pressed={attentionOnly}
          className={`flex flex-shrink-0 items-center gap-3 border-b border-border/60 px-3 py-1.5 text-2xs ${
            attentionOnly ? "bg-accent/10 text-text-1" : "text-text-2 hover:text-text-0"
          }`}
        >
          {fuCount > 0 && (
            <span className="flex items-center gap-1 text-accent">
              <Clock className="h-3 w-3" /> {fuCount} to follow up
            </span>
          )}
          {coldCount > 0 && (
            <span className="flex items-center gap-1 text-danger">
              <Flame className="h-3 w-3" /> {coldCount} going cold
            </span>
          )}
          <span className="ml-auto text-text-3">
            {attentionOnly ? "Show all" : "Focus"}
          </span>
        </button>
      )}

      {/* Board */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center text-text-3">
          <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" />
        </div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-text-3">
          {error}
        </div>
      ) : !pipeline ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-text-3">
          No space available. Create or join a space to start a pipeline.
        </div>
      ) : view === "list" ? (
        <PipelineList
          leads={leads}
          pipeline={pipeline}
          nowMs={nowMs}
          onSelect={(id) => setSelectedLead(id)}
        />
      ) : leads.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <LayoutGrid className="h-8 w-8 text-text-3" aria-hidden="true" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-text-1">No leads yet</p>
            <p className="text-xs text-text-3">
              Track a property, owner, or assemblage from first contact through to a
              Terminal.
            </p>
          </div>
          <Button size="sm" onClick={() => setCreateStage(pipeline.stages[0]?.key ?? null)}>
            <Plus className="h-3 w-3" /> Add your first lead
          </Button>
        </div>
      ) : (
        <div
          className="flex min-h-0 flex-1 gap-2 overflow-x-auto p-2"
          onDragLeave={(e) => {
            // Clear the column highlight only when the cursor leaves the board.
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              setDragOverStage(null);
            }
          }}
        >
          {/* Orphans — leads whose stage was removed from the pipeline. Surface
              them in a holding column (drag into a real stage to re-home) rather
              than silently dropping them off the board. */}
          {orphans.length > 0 && (
            <div className="flex min-w-[13rem] flex-1 flex-col rounded border border-danger/40 bg-danger/5">
              <div className="flex flex-shrink-0 items-center gap-1.5 border-b border-danger/30 px-2 py-1.5">
                <span className="text-2xs font-semibold uppercase tracking-wide text-danger">
                  Unassigned
                </span>
                <span className="font-mono text-2xs text-text-3">{orphans.length}</span>
                <span className="ml-auto text-[9px] text-text-3">stage removed</span>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-1.5">
                {orphans.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    stages={stages}
                    nowMs={nowMs}
                    onClick={() => setSelectedLead(lead.id)}
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", lead.id)}
                  />
                ))}
              </div>
            </div>
          )}
          {columns.map(({ stage, leads: colLeads }) => {
            const colValue = rollup ? sumAttr(colLeads, rollup.key) : 0;
            const coldInCol = colLeads.filter((l) => isRotting(l, stages, nowMs)).length;
            return (
            <div
              key={stage.key}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOverStage !== stage.key) setDragOverStage(stage.key);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverStage(null);
                const id = e.dataTransfer.getData("text/plain");
                if (id) void moveLead(id, stage.key);
              }}
              className={`flex min-w-[13rem] flex-1 flex-col rounded border bg-bg-2/30 ${
                dragOverStage === stage.key
                  ? "border-border-focus bg-accent/5"
                  : "border-border/60"
              }`}
            >
              <div className="flex flex-shrink-0 items-center gap-1.5 border-b border-border/50 px-2 py-1.5">
                <span className="text-2xs font-semibold uppercase tracking-wide text-text-2">
                  {stage.label}
                </span>
                <span className="font-mono text-2xs text-text-3">{colLeads.length}</span>
                <div className="ml-auto flex items-center gap-1.5">
                  {colValue > 0 && (
                    <span
                      className="font-mono text-2xs text-text-3"
                      title={`${rollup?.label ?? "Value"} in ${stage.label}`}
                    >
                      {compactMoney(colValue)}
                    </span>
                  )}
                  {coldInCol > 0 && (
                    <span
                      className="flex items-center gap-0.5 text-[9px] text-danger"
                      title={`${coldInCol} going cold`}
                    >
                      <Flame className="h-2.5 w-2.5" />
                      {coldInCol}
                    </span>
                  )}
                  {stage.is_terminal_gate && (
                    <span className="text-[9px] uppercase tracking-wide text-accent">
                      gate
                    </span>
                  )}
                </div>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-1.5">
                {colLeads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    stages={pipeline.stages}
                    nowMs={nowMs}
                    onClick={() => setSelectedLead(lead.id)}
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", lead.id)}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => setCreateStage(stage.key)}
                className="flex flex-shrink-0 items-center gap-1 border-t border-border/40 px-2 py-1 text-2xs text-text-3 hover:text-text-1"
              >
                <Plus className="h-3 w-3" /> Add
              </button>
            </div>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      {createStage && pipeline && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 sm:p-8"
          onClick={() => setCreateStage(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="New lead"
            className="mt-6 flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-border bg-bg-1 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-shrink-0 items-center gap-2 border-b border-border px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-text-3">
                New lead
              </span>
              <button
                type="button"
                onClick={() => setCreateStage(null)}
                aria-label="Close"
                className="ml-auto rounded-sm p-1 text-text-2 hover:text-text-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <LeadForm
                pipeline={pipeline}
                defaultStage={createStage}
                busy={createBusy}
                error={createErr}
                submitLabel="Create"
                onCancel={() => setCreateStage(null)}
                onSubmit={create}
              />
            </div>
          </div>
        </div>
      )}

      {/* Lead drawer */}
      {selectedLead && pipeline && (
        <div
          className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/50"
          onClick={() => setSelectedLead(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Lead detail"
            className="h-full w-full max-w-[400px] border-l border-border bg-bg-1 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <LeadDetail
              leadId={selectedLead}
              pipeline={pipeline}
              onClose={() => setSelectedLead(null)}
              onChanged={refresh}
            />
          </div>
        </div>
      )}

      {/* Fields editor */}
      {fieldsOpen && pipeline && (
        <FieldsEditor
          pipeline={pipeline}
          onClose={() => setFieldsOpen(false)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
