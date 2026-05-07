"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog } from "./Dialog";
import { TaskComposer, type TaskComposerMember } from "./TaskComposer";
import type { DashSpace, DashTerminal } from "@/lib/dashboard-queries";

interface QuickTaskDialogProps {
  open: boolean;
  onClose: () => void;
  /** All terminals visible to the user (from the explorer-rail query). */
  terminals: DashTerminal[];
  /** Spaces, used to label terminal options by their parent space name. */
  spaces: DashSpace[];
  /** Optional pre-selected terminal id (e.g. "+ task in this terminal"). */
  defaultTerminalId?: string | null;
  /**
   * Current viewer's user_id. Forwarded to the inner TaskComposer so
   * the assignee chip auto-defaults to the viewer once a terminal
   * is picked AND the viewer is one of that terminal's members.
   */
  currentUserId?: string;
}

/**
 * Dashboard-side "+ Quick task" dialog.
 *
 * Lets the user create a task without first navigating into a
 * terminal — pick which terminal it lands in, fill the title and
 * chips, hit Create. Reuses `TaskComposer` for the fields; this
 * wrapper only adds the terminal picker (rendered in the composer's
 * `prefixSlot`) and routes the submitted payload to the right
 * project-scoped POST endpoint.
 *
 * Members for the assignee chip are fetched lazily once a terminal
 * is selected, so the request only fires when needed and updates
 * automatically if the user switches terminals before submitting.
 */
export function QuickTaskDialog({
  open,
  onClose,
  terminals,
  spaces,
  defaultTerminalId = null,
  currentUserId,
}: QuickTaskDialogProps) {
  const [terminalId, setTerminalId] = useState<string | null>(
    defaultTerminalId,
  );
  const [members, setMembers] = useState<TaskComposerMember[]>([]);
  const [composerKey, setComposerKey] = useState(0);

  // Reset selection on open so a stale value from a previous
  // open doesn't leak in. Honour the optional default each time.
  useEffect(() => {
    if (open) {
      setTerminalId(defaultTerminalId);
      setMembers([]);
      // Bump the composer key to force a fresh, empty composer state
      // every time the dialog reopens.
      setComposerKey((k) => k + 1);
    }
  }, [open, defaultTerminalId]);

  // Fetch members for the selected terminal — feeds the assignee chip.
  useEffect(() => {
    if (!open || !terminalId) {
      setMembers([]);
      return;
    }
    const terminal = terminals.find((t) => t.id === terminalId);
    if (!terminal) return;
    let cancelled = false;
    void fetch(`/api/v1/projects/${terminal.ticker}/members`, {
      credentials: "include",
    })
      .then((r) => r.json() as Promise<{
        data?: {
          members?: {
            user_id: string;
            profiles: { full_name: string | null } | null;
          }[];
        };
      }>)
      .then((body) => {
        if (cancelled) return;
        const ms = (body.data?.members ?? []).map((m) => ({
          user_id: m.user_id,
          full_name: m.profiles?.full_name ?? null,
        }));
        setMembers(ms);
      })
      .catch(() => {
        // Non-fatal — composer will just hide the assignee chip.
      });
    return () => {
      cancelled = true;
    };
  }, [open, terminalId, terminals]);

  const selectedTerminal = useMemo(
    () => terminals.find((t) => t.id === terminalId) ?? null,
    [terminalId, terminals],
  );

  async function handleSubmit(input: {
    title: string;
    priority: number;
    due_date: string | null;
    labels: string[];
    assignee_ids: string[];
  }) {
    if (!selectedTerminal) {
      throw new Error("Pick a terminal first");
    }
    const r = await fetch(
      `/api/v1/projects/${selectedTerminal.ticker}/tasks`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: input.title,
          priority: input.priority,
          due_date: input.due_date,
          labels: input.labels,
          assignee_ids:
            input.assignee_ids.length > 0 ? input.assignee_ids : undefined,
        }),
      },
    );
    if (!r.ok) {
      const body = (await r.json().catch(() => ({}))) as {
        errors?: { message: string }[];
      };
      throw new Error(
        body.errors?.[0]?.message ?? `Failed to create (HTTP ${r.status})`,
      );
    }
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New task"
      className="max-w-xl"
    >
      <TaskComposer
        key={composerKey}
        members={members}
        currentUserId={currentUserId}
        variant="dialog"
        autoFocus={Boolean(terminalId)}
        placeholder="Task title…"
        submitDisabled={!terminalId}
        submitLabel={
          selectedTerminal
            ? `Create in ${selectedTerminal.ticker}`
            : "Pick a terminal first"
        }
        onSubmit={handleSubmit}
        onCancel={onClose}
        prefixSlot={
          <TerminalPicker
            terminals={terminals}
            spaces={spaces}
            selectedId={terminalId}
            onSelect={setTerminalId}
          />
        }
      />
    </Dialog>
  );
}

/* ----------------------------------------------------------------- */
/* Terminal picker                                                    */
/* ----------------------------------------------------------------- */

function TerminalPicker({
  terminals,
  spaces,
  selectedId,
  onSelect,
}: {
  terminals: DashTerminal[];
  spaces: DashSpace[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const spaceById = useMemo(
    () => new Map(spaces.map((s) => [s.id, s])),
    [spaces],
  );
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const selected = useMemo(
    () => terminals.find((t) => t.id === selectedId) ?? null,
    [terminals, selectedId],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return terminals;
    return terminals.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.ticker.toLowerCase().includes(q),
    );
  }, [terminals, query]);

  // Group by space for visual hierarchy.
  const grouped = useMemo(() => {
    const groups = new Map<
      string,
      { name: string; items: DashTerminal[] }
    >();
    for (const t of filtered) {
      const space = spaceById.get(t.space_id);
      const spaceName = space?.name ?? "Unknown space";
      const g = groups.get(t.space_id) ?? { name: spaceName, items: [] };
      g.items.push(t);
      groups.set(t.space_id, g);
    }
    return Array.from(groups.values());
  }, [filtered, spaceById]);

  return (
    <div ref={containerRef} className="relative">
      <label
        className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-text-3"
        htmlFor="quick-task-terminal"
      >
        Terminal
      </label>
      <button
        id="quick-task-terminal"
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center justify-between rounded-sm border bg-bg-2 px-2 py-1.5 text-left text-xs",
          selected
            ? "border-accent/40 text-text-0"
            : "border-border text-text-2 hover:border-border-focus",
        )}
      >
        {selected ? (
          <span className="flex items-center gap-2 truncate">
            <span className="font-mono text-[10px] text-accent">
              {selected.ticker}
            </span>
            <span className="truncate text-text-1">{selected.name}</span>
            <span className="truncate font-mono text-[10px] text-text-3">
              · {spaceById.get(selected.space_id)?.name ?? ""}
            </span>
          </span>
        ) : (
          <span>Pick a terminal…</span>
        )}
        <ChevronDown
          className={cn(
            "h-3 w-3 flex-shrink-0 text-text-3 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label="Terminals"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-sm border border-border bg-bg-1 shadow-lg"
        >
          <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-bg-1 px-2 py-1.5">
            <Search
              className="h-3 w-3 flex-shrink-0 text-text-3"
              aria-hidden="true"
            />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter terminals…"
              aria-label="Filter terminals"
              className="flex-1 bg-transparent text-xs text-text-0 placeholder:text-text-3 outline-none"
            />
          </div>
          {grouped.length === 0 ? (
            <p className="px-3 py-3 text-xs text-text-3">
              No terminals match{" "}
              <span className="font-mono text-text-2">
                &ldquo;{query}&rdquo;
              </span>
              .
            </p>
          ) : (
            grouped.map((g, gi) => (
              <div
                key={gi}
                className="border-b border-border last:border-b-0"
              >
                <p className="px-3 pt-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-text-3">
                  {g.name}
                </p>
                <ul role="none" className="py-1">
                  {g.items.map((t) => {
                    const isSelected = t.id === selectedId;
                    return (
                      <li key={t.id} role="none">
                        <button
                          role="option"
                          type="button"
                          aria-selected={isSelected}
                          onClick={() => {
                            onSelect(t.id);
                            setOpen(false);
                            setQuery("");
                          }}
                          className={cn(
                            "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs",
                            isSelected
                              ? "bg-accent-subtle text-text-0"
                              : "text-text-1 hover:bg-bg-2",
                          )}
                        >
                          <span className="w-12 flex-shrink-0 truncate font-mono text-[10px] text-accent">
                            {t.ticker}
                          </span>
                          <span className="flex-1 truncate">{t.name}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
