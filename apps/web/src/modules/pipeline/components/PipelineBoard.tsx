"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import {
  Plus,
  X,
  Clock,
  Flame,
  LayoutGrid,
  List,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  ChevronsLeftRight,
  ChevronsRightLeft,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { LeadRow, PipelineRow } from "@/lib/pipeline/db";
import {
  groupByStage,
  isFollowUpDue,
  isRotting,
  rollupField,
  sumAttr,
  compactMoney,
  leadHaystack,
  sortLeads,
  type LeadSort,
} from "@/lib/pipeline/board";
import { PipelineList } from "./PipelineList";
import { CustomizePanel } from "./CustomizePanel";
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
const COLLAPSE_KEY = "rokki:pipeline-collapsed";
const SORT_KEY = "rokki:pipeline-sort";
const SORTS: { v: LeadSort; label: string }[] = [
  { v: "manual", label: "Default order" },
  { v: "value", label: "Value ↓" },
  { v: "cold", label: "Going cold" },
  { v: "updated", label: "Recently updated" },
];

interface MoveToast {
  leadId: string;
  fromStage: string;
  fromStatus: LeadRow["status"];
  toLabel: string;
}

export function PipelineBoard() {
  const [spaces, setSpaces] = useState<SpaceLite[]>([]);
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [pipeline, setPipeline] = useState<PipelineRow | null>(null);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<LeadSort>("manual");
  const [view, setView] = useState<"board" | "list">("board");

  useEffect(() => {
    const saved =
      typeof window !== "undefined" ? window.localStorage.getItem(SORT_KEY) : null;
    if (saved && SORTS.some((s) => s.v === saved)) setSort(saved as LeadSort);
  }, []);
  function selectSort(s: LeadSort) {
    setSort(s);
    if (typeof window !== "undefined") window.localStorage.setItem(SORT_KEY, s);
  }
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
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [toast, setToast] = useState<MoveToast | null>(null);

  // Auto-dismiss the move toast after a few seconds.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  // Collapsed (minimized) columns, by stage key — persisted per pipeline so a
  // focused subset survives reloads.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!pipeline || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(`${COLLAPSE_KEY}:${pipeline.id}`);
      const keys: string[] = raw ? JSON.parse(raw) : [];
      setCollapsed(new Set(Array.isArray(keys) ? keys : []));
    } catch {
      setCollapsed(new Set());
    }
  }, [pipeline?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function persistCollapsed(next: Set<string>) {
    setCollapsed(next);
    if (pipeline && typeof window !== "undefined") {
      window.localStorage.setItem(
        `${COLLAPSE_KEY}:${pipeline.id}`,
        JSON.stringify([...next]),
      );
    }
  }
  function toggleCollapse(key: string) {
    const next = new Set(collapsed);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    persistCollapsed(next);
  }

  // Esc closes whichever overlay is open (+ restores focus to the trigger).
  useOverlay(createStage != null, () => setCreateStage(null));
  useOverlay(selectedLead != null && createStage == null, () => setSelectedLead(null));

  // Board shortcuts: n = new lead, b = board view, l = list view. Ignored while
  // typing or while an overlay is open (Esc handles those).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable)
        return;
      if (createStage != null || selectedLead != null || customizeOpen) return;
      if (e.key === "n") {
        e.preventDefault();
        if (pipeline) setCreateStage(pipeline.stages[0]?.key ?? null);
      } else if (e.key === "b") {
        selectView("board");
      } else if (e.key === "l") {
        selectView("list");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createStage, selectedLead, customizeOpen, pipeline]);

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
    const before = leads.find((l) => l.id === leadId);
    if (before && before.stage === stageKey) return; // dropped on its own column
    // Sync status to the destination stage type. Moving INTO won/lost sets it;
    // moving back OUT of won/lost into an open-type stage must clear it back to
    // "open" (previously it was left undefined, so a lead dragged out of Won
    // stayed status:"won" forever). Leave dead/converted untouched — those are
    // set by explicit actions, not by a drag.
    const status: LeadRow["status"] | undefined =
      stage.type === "won"
        ? "won"
        : stage.type === "lost"
          ? "lost"
          : before && (before.status === "won" || before.status === "lost")
            ? "open"
            : undefined;
    const prev = leads;
    setLeads((ls) =>
      ls.map((l) =>
        l.id === leadId ? { ...l, stage: stageKey, ...(status ? { status } : {}) } : l,
      ),
    );
    try {
      // Merge the authoritative server row (reconciles last_activity_at etc.)
      // instead of a full getBoard() refetch on every drop.
      const updated = await updateLead(leadId, {
        stage: stageKey,
        ...(status ? { status } : {}),
      });
      setLeads((ls) => ls.map((l) => (l.id === leadId ? updated : l)));
      if (before) {
        setToast({
          leadId,
          fromStage: before.stage,
          fromStatus: before.status,
          toLabel: stage.label,
        });
      }
    } catch {
      setLeads(prev); // revert on failure
    }
  }

  // Restore a lead's prior stage + status (used by the move toast's Undo).
  async function undoMove(t: MoveToast) {
    setToast(null);
    const prev = leads;
    setLeads((ls) =>
      ls.map((l) =>
        l.id === t.leadId ? { ...l, stage: t.fromStage, status: t.fromStatus } : l,
      ),
    );
    try {
      const updated = await updateLead(t.leadId, {
        stage: t.fromStage,
        status: t.fromStatus,
      });
      setLeads((ls) => ls.map((l) => (l.id === t.leadId ? updated : l)));
    } catch {
      setLeads(prev);
    }
  }

  async function create(patch: LeadInput) {
    if (!pipeline || !spaceId) return;
    setCreateBusy(true);
    setCreateErr(null);
    try {
      await createLead({ ...patch, pipeline_id: pipeline.id, space_id: spaceId });
      // Just save and close — the new lead lands on the board in one step.
      // (We used to auto-open the detail drawer here, but that read as the
      // entry form "cutting out" and forced a needless second Save.)
      setCreateStage(null);
      await refresh();
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : "Could not create");
    } finally {
      setCreateBusy(false);
    }
  }

  const stages = useMemo(() => pipeline?.stages ?? [], [pipeline]);
  const q = query.trim().toLowerCase();

  // Searchable text is computed ONCE per lead (JSON.stringify of attributes is
  // the expensive bit) so each search keystroke just does a substring test.
  const haystackById = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of leads) m.set(l.id, leadHaystack(l));
    return m;
  }, [leads]);
  const matches = (l: LeadRow) => (haystackById.get(l.id) ?? "").includes(q);

  const activeLeads = useMemo(
    () => leads.filter((l) => l.status !== "converted" && l.status !== "dead"),
    [leads],
  );
  // Only the attention counts depend on the 60s `nowMs` tick.
  const { fuCount, coldCount } = useMemo(() => {
    let fu = 0;
    let cold = 0;
    for (const l of activeLeads) {
      if (isFollowUpDue(l, nowMs)) fu++;
      if (isRotting(l, stages, nowMs)) cold++;
    }
    return { fuCount: fu, coldCount: cold };
  }, [activeLeads, stages, nowMs]);

  const queriedActive = useMemo(
    () => (q ? activeLeads.filter(matches) : activeLeads),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeLeads, q, haystackById],
  );
  const visibleLeads = useMemo(
    () =>
      attentionOnly
        ? queriedActive.filter(
            (l) => isFollowUpDue(l, nowMs) || isRotting(l, stages, nowMs),
          )
        : queriedActive,
    [attentionOnly, queriedActive, stages, nowMs],
  );
  const { columns, orphans } = useMemo(
    () => groupByStage(visibleLeads, stages),
    [visibleLeads, stages],
  );
  const rollup = useMemo(() => (pipeline ? rollupField(pipeline.fields) : null), [pipeline]);
  const cardFields = useMemo(
    () => (pipeline ? pipeline.fields.filter((f) => f.card) : []),
    [pipeline],
  );
  const boardValue = useMemo(
    () => (rollup ? sumAttr(visibleLeads, rollup.key) : 0),
    [rollup, visibleLeads],
  );
  // The list view honors the same search box (attention-focus is board-only).
  const listLeads = useMemo(
    () => (q ? leads.filter(matches) : leads),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [leads, q, haystackById],
  );
  const allCollapsed =
    columns.length > 0 && columns.every((c) => collapsed.has(c.stage.key));

  return (
    <div className="relative flex h-full min-h-0 flex-col">
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
        {boardValue > 0 ? (
          <span
            className="font-mono text-2xs text-text-2"
            title="Total value across the leads shown"
          >
            {compactMoney(boardValue)}
          </span>
        ) : null}
        {pipeline ? (
          <div className="flex h-7 w-40 items-center gap-1.5 rounded-sm border border-border bg-bg-2 px-2 focus-within:border-border-focus">
            <Search className="h-3 w-3 flex-shrink-0 text-text-3" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search leads…"
              aria-label="Search leads"
              className="min-w-0 flex-1 bg-transparent text-xs text-text-1 placeholder:text-text-3 outline-none"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="rounded-sm p-0.5 text-text-3 hover:text-text-1"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        ) : null}
        {view === "board" && pipeline ? (
          <select
            value={sort}
            onChange={(e) => selectSort(e.target.value as LeadSort)}
            aria-label="Sort leads within columns"
            title="Sort leads within each column"
            className="h-7 rounded-sm border border-border bg-bg-2 px-1.5 text-2xs text-text-1 outline-none focus:border-border-focus"
          >
            {SORTS.map((s) => (
              <option key={s.v} value={s.v}>
                {s.label}
              </option>
            ))}
          </select>
        ) : null}
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
        {view === "board" && columns.length > 0 ? (
          <button
            type="button"
            onClick={() =>
              persistCollapsed(
                allCollapsed
                  ? new Set()
                  : new Set(columns.map((c) => c.stage.key)),
              )
            }
            aria-label={allCollapsed ? "Expand all columns" : "Collapse all columns"}
            title={allCollapsed ? "Expand all columns" : "Collapse all columns"}
            className="rounded-sm p-1 text-text-3 hover:bg-bg-2 hover:text-text-0"
          >
            {allCollapsed ? (
              <ChevronsLeftRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronsRightLeft className="h-3.5 w-3.5" />
            )}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setCustomizeOpen(true)}
          aria-label="Customize pipeline"
          title="Customize stages & fields"
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
        <BoardSkeleton view={view} />
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
          leads={listLeads}
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
                    cardFields={cardFields}
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
            const sortedLeads = sortLeads(colLeads, sort, rollup?.key ?? null);
            const overWip =
              typeof stage.wip_limit === "number" &&
              stage.wip_limit > 0 &&
              colLeads.length > stage.wip_limit;
            // Drop handlers are shared by the full and collapsed column so you
            // can drag a card onto a minimized stage too.
            const onDragOver = (e: DragEvent) => {
              e.preventDefault();
              if (dragOverStage !== stage.key) setDragOverStage(stage.key);
            };
            const onDrop = (e: DragEvent) => {
              e.preventDefault();
              setDragOverStage(null);
              const id = e.dataTransfer.getData("text/plain");
              if (id) void moveLead(id, stage.key);
            };

            // Minimized column — a thin vertical rail you click to reopen.
            if (collapsed.has(stage.key)) {
              return (
                <button
                  key={stage.key}
                  type="button"
                  onClick={() => toggleCollapse(stage.key)}
                  onDragOver={onDragOver}
                  onDrop={onDrop}
                  title={`Expand ${stage.label}`}
                  aria-label={`Expand ${stage.label} column`}
                  className={`flex w-9 flex-shrink-0 flex-col items-center gap-2 rounded border bg-bg-2/30 py-2 hover:bg-bg-2/60 ${
                    dragOverStage === stage.key
                      ? "border-border-focus bg-accent/5"
                      : "border-border/60"
                  }`}
                >
                  <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-text-3" />
                  <span className="font-mono text-2xs text-text-3">{colLeads.length}</span>
                  {coldInCol > 0 ? (
                    <Flame className="h-2.5 w-2.5 flex-shrink-0 text-danger" />
                  ) : null}
                  <span className="mt-0.5 max-h-40 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-2xs font-semibold uppercase tracking-wide text-text-2 [writing-mode:vertical-rl]">
                    {stage.label}
                  </span>
                </button>
              );
            }
            return (
            <div
              key={stage.key}
              onDragOver={onDragOver}
              onDrop={onDrop}
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
                <span
                  className={`font-mono text-2xs ${overWip ? "font-semibold text-warning" : "text-text-3"}`}
                  title={
                    overWip
                      ? `Over WIP limit — ${colLeads.length} of ${stage.wip_limit}`
                      : undefined
                  }
                >
                  {colLeads.length}
                  {overWip ? `/${stage.wip_limit}` : ""}
                </span>
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
                  <button
                    type="button"
                    onClick={() => toggleCollapse(stage.key)}
                    aria-label={`Collapse ${stage.label} column`}
                    title="Collapse column"
                    className="rounded-sm p-0.5 text-text-3 hover:text-text-1"
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-1.5">
                {sortedLeads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    stages={pipeline.stages}
                    nowMs={nowMs}
                    cardFields={cardFields}
                    onClick={() => setSelectedLead(lead.id)}
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", lead.id)}
                  />
                ))}
                {colLeads.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center rounded border border-dashed border-border/40 px-2 py-4 text-center text-[10px] text-text-3">
                    {q ? "No matches" : "Drop a lead here"}
                  </div>
                ) : null}
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

      {/* Customize (stages + fields) */}
      {customizeOpen && pipeline && (
        <CustomizePanel
          pipeline={pipeline}
          onClose={() => setCustomizeOpen(false)}
          onSaved={refresh}
        />
      )}

      {/* Move toast + Undo */}
      {toast && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-40 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-3 rounded-md border border-border bg-bg-1 px-3 py-1.5 text-xs text-text-1 shadow-lg">
            <span className="truncate">
              Moved to <span className="font-medium text-text-0">{toast.toLabel}</span>
            </span>
            <button
              type="button"
              onClick={() => void undoMove(toast)}
              className="font-semibold text-accent hover:underline"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label="Dismiss"
              className="rounded-sm p-0.5 text-text-3 hover:text-text-1"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Ghost board/list that matches the real layout, so content doesn't jump in on
 *  load. View-aware so the placeholder matches the view you'll land in. */
function BoardSkeleton({ view }: { view: "board" | "list" }) {
  if (view === "list") {
    return (
      <div className="flex min-h-0 flex-1 flex-col" aria-hidden="true">
        <div className="border-b border-border/60 px-3 py-1.5">
          <span className="block h-5 w-40 animate-pulse rounded-sm bg-bg-2" />
        </div>
        {Array.from({ length: 8 }).map((_, r) => (
          <div key={r} className="flex items-center gap-2.5 border-b border-border/30 px-3 py-2">
            <span className="h-2.5 flex-1 animate-pulse rounded-sm bg-bg-3" />
            <span className="h-2.5 w-16 animate-pulse rounded-sm bg-bg-3" />
            <span className="hidden h-2.5 w-20 animate-pulse rounded-sm bg-bg-3 sm:block" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 gap-2 overflow-hidden p-2" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, c) => (
        <div
          key={c}
          className="flex min-w-[13rem] flex-1 flex-col rounded border border-border/60 bg-bg-2/30"
        >
          <div className="flex items-center gap-1.5 border-b border-border/50 px-2 py-1.5">
            <span className="h-2.5 w-16 animate-pulse rounded-sm bg-bg-3" />
          </div>
          <div className="flex flex-col gap-1.5 p-1.5">
            {Array.from({ length: 3 - (c % 2) }).map((__, k) => (
              <div
                key={k}
                className="flex flex-col gap-1.5 rounded border border-border bg-bg-1 px-2 py-2"
              >
                <span className="h-2.5 w-3/4 animate-pulse rounded-sm bg-bg-3" />
                <span className="h-2 w-1/2 animate-pulse rounded-sm bg-bg-3" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
