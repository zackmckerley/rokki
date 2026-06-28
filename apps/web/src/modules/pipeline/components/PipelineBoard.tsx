"use client";

import { useEffect, useState } from "react";
import { Plus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { LeadRow, PipelineRow } from "@/lib/pipeline/db";
import { groupByStage } from "@/lib/pipeline/board";
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

const SPACE_KEY = "rokki:pipeline-space";

export function PipelineBoard() {
  const [spaces, setSpaces] = useState<SpaceLite[]>([]);
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [pipeline, setPipeline] = useState<PipelineRow | null>(null);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const nowMs = Date.now();

  const [selectedLead, setSelectedLead] = useState<string | null>(null);
  const [createStage, setCreateStage] = useState<string | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

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
      await createLead({ ...patch, pipeline_id: pipeline.id, space_id: spaceId });
      setCreateStage(null);
      await refresh();
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : "Could not create");
    } finally {
      setCreateBusy(false);
    }
  }

  const visibleLeads = leads.filter(
    (l) => l.status !== "converted" && l.status !== "dead",
  );
  const { columns } = groupByStage(visibleLeads, pipeline?.stages ?? []);

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
        <Button
          size="sm"
          className="ml-auto"
          onClick={() => setCreateStage(pipeline?.stages[0]?.key ?? null)}
          disabled={!pipeline}
        >
          <Plus className="h-3 w-3" /> Lead
        </Button>
      </div>

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
      ) : (
        <div className="flex min-h-0 flex-1 gap-2 overflow-x-auto p-2">
          {columns.map(({ stage, leads: colLeads }) => (
            <div
              key={stage.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                if (id) void moveLead(id, stage.key);
              }}
              className="flex w-56 flex-shrink-0 flex-col rounded border border-border/60 bg-bg-2/30"
            >
              <div className="flex flex-shrink-0 items-center gap-1.5 border-b border-border/50 px-2 py-1.5">
                <span className="text-2xs font-semibold uppercase tracking-wide text-text-2">
                  {stage.label}
                </span>
                <span className="font-mono text-2xs text-text-3">{colLeads.length}</span>
                {stage.is_terminal_gate && (
                  <span className="ml-auto text-[9px] uppercase tracking-wide text-accent">
                    gate
                  </span>
                )}
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
          ))}
        </div>
      )}

      {/* Create modal */}
      {createStage && pipeline && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 sm:p-8"
          onClick={() => setCreateStage(null)}
        >
          <div
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
    </div>
  );
}
