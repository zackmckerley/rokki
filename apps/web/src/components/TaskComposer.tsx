"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  AlertCircle,
  Calendar,
  ChevronDown,
  Circle,
  Flag,
  Tag,
  UserPlus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatDueLabel,
  parseDueDate,
} from "@/lib/parse-due-date";

export interface TaskComposerMember {
  user_id: string;
  full_name: string | null;
}

export interface TaskComposerSubmit {
  title: string;
  /** 1=High, 2=Medium, 3=Low, null=No priority. */
  priority: number | null;
  due_date: string | null;
  labels: string[];
  assignee_ids: string[];
}

interface TaskComposerProps {
  /** Members available for assignee selection. Empty = no picker. */
  members?: TaskComposerMember[];
  /**
   * Pre-fill the priority chip. Defaults to null = "No priority".
   * Use 1/2/3 for High/Medium/Low.
   */
  initialPriority?: number | null;
  /** Pre-fill assignees. */
  initialAssigneeIds?: string[];
  /**
   * Current viewer's user_id. When provided AND `initialAssigneeIds`
   * is empty, the composer auto-pre-populates the assignee chip
   * with the current user — matches the dashboard pattern of "I
   * created this, so it's mine unless I say otherwise" without
   * the user having to click into the picker.
   */
  currentUserId?: string;
  /** Pre-fill labels. */
  initialLabels?: string[];
  /**
   * Render variant. `inline` uses a tight horizontal layout suited to
   * the task list itself; `dialog` uses a roomier vertical layout.
   */
  variant?: "inline" | "dialog";
  /** Auto-focus the title input on mount. Default true. */
  autoFocus?: boolean;
  /** Optional placeholder for the title input. */
  placeholder?: string;
  /** Async submit handler. Throws to surface an error in the composer. */
  onSubmit: (input: TaskComposerSubmit) => Promise<void>;
  /** Cancel handler — closes the composer / clears the dialog. */
  onCancel?: () => void;
  /**
   * Optional extra slot rendered between the chips and the action
   * buttons. The dashboard quick-create uses this for the terminal
   * picker, which has no equivalent in the inline variant.
   */
  prefixSlot?: React.ReactNode;
  /**
   * Disable submission — useful when the prefix slot has a required
   * value that hasn't been filled yet (e.g. terminal not picked).
   */
  submitDisabled?: boolean;
  /** Custom label for the submit button. Defaults to "Create". */
  submitLabel?: string;
}

/**
 * Reusable rich task composer.
 *
 * Renders a single-line title input plus four chips — priority, due
 * date, assignees, labels — that can be edited inline without leaving
 * the composer. Submitting the form posts a single `TaskComposerSubmit`
 * to `onSubmit`; the parent decides which terminal it lands in.
 *
 * Used in two places (so far):
 *   - `TasksPane` inline composer (replaces the title-only form)
 *   - `QuickTaskDialog` dashboard pop-up (with a prefixSlot for the
 *     terminal picker)
 *
 * Keyboard:
 *   - Enter — submit
 *   - Esc — cancel
 *   - Tab — cycle through title → chips → submit
 */
export function TaskComposer({
  members = [],
  initialPriority = null,
  initialAssigneeIds = [],
  currentUserId,
  initialLabels = [],
  variant = "inline",
  autoFocus = true,
  placeholder = "New task… Enter to save, Esc to cancel",
  onSubmit,
  onCancel,
  prefixSlot,
  submitDisabled = false,
  submitLabel = "Create",
}: TaskComposerProps) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<number | null>(initialPriority);
  const [dueIso, setDueIso] = useState<string | null>(null);
  // If the parent gave us a currentUserId AND no explicit pre-fill,
  // default the assignee to the viewer. Matches "I made this, so
  // it's mine until I say otherwise."
  const [assigneeIds, setAssigneeIds] = useState<string[]>(() => {
    if (initialAssigneeIds.length > 0) return initialAssigneeIds;
    if (currentUserId && members.some((m) => m.user_id === currentUserId)) {
      return [currentUserId];
    }
    return [];
  });
  const [labels, setLabels] = useState<string[]>(initialLabels);
  const [labelDraft, setLabelDraft] = useState("");
  const [showAssignees, setShowAssignees] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) titleRef.current?.focus();
  }, [autoFocus]);

  function commitLabel() {
    const next = labelDraft.trim().replace(/^#/, "");
    if (!next) return;
    setLabels((prev) => (prev.includes(next) ? prev : [...prev, next]));
    setLabelDraft("");
  }

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    if (submitting || submitDisabled) return;
    if (!title.trim()) {
      setError("Title is required");
      titleRef.current?.focus();
      return;
    }
    setSubmitting(true);
    setError(null);

    // Make sure any pending label input gets committed before submit.
    const labelsFinal = labelDraft.trim()
      ? Array.from(
          new Set([...labels, labelDraft.trim().replace(/^#/, "")]),
        )
      : labels;

    try {
      await onSubmit({
        title: title.trim(),
        priority,
        due_date: dueIso,
        labels: labelsFinal,
        assignee_ids: assigneeIds,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSubmitting(false);
    }
  }

  const isInline = variant === "inline";

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "flex flex-col gap-2 border-border bg-bg-1",
        isInline ? "border-t px-4 py-2.5" : "rounded-md p-3",
      )}
      aria-label="New task"
    >
      {prefixSlot}

      {/* Row 1: status icon + title */}
      <div className="flex items-center gap-3">
        <Circle
          className="h-3.5 w-3.5 flex-shrink-0 text-text-3"
          aria-hidden="true"
        />
        <input
          ref={titleRef}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onCancel?.();
            }
          }}
          placeholder={placeholder}
          aria-label="Task title"
          className="flex-1 bg-transparent text-sm text-text-0 placeholder:text-text-3 outline-none"
          disabled={submitting}
        />
      </div>

      {/* Row 2: chips */}
      <div className="flex flex-wrap items-center gap-1.5 pl-7">
        <PriorityChip
          priority={priority}
          onChange={setPriority}
          disabled={submitting}
        />
        <DueChipPopover
          iso={dueIso}
          onChange={setDueIso}
          disabled={submitting}
        />
        {members.length > 0 ? (
          <AssigneeChip
            members={members}
            selected={assigneeIds}
            open={showAssignees}
            onToggleOpen={() => setShowAssignees((v) => !v)}
            onChange={setAssigneeIds}
            disabled={submitting}
          />
        ) : null}
        <LabelsChip
          labels={labels}
          draft={labelDraft}
          onDraftChange={setLabelDraft}
          onCommit={commitLabel}
          onRemove={(l) =>
            setLabels((prev) => prev.filter((x) => x !== l))
          }
          disabled={submitting}
        />

        {/* Action buttons pin to the right on inline; stack on dialog. */}
        <div className="ml-auto flex items-center gap-2">
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="text-xs text-text-3 hover:text-text-1"
              disabled={submitting}
            >
              Esc
            </button>
          ) : null}
          <button
            type="submit"
            disabled={submitting || submitDisabled || !title.trim()}
            className={cn(
              "rounded-sm border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide",
              submitting || submitDisabled || !title.trim()
                ? "cursor-not-allowed border-border bg-bg-2 text-text-3"
                : "border-accent bg-accent text-bg-0 hover:bg-accent-hover",
            )}
          >
            {submitting ? "…" : submitLabel}
          </button>
        </div>
      </div>

      {error ? (
        <p className="flex items-center gap-1 pl-7 text-xs text-danger">
          <AlertCircle className="h-3 w-3" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </form>
  );
}

/* --------------------------------------------------------------- */
/* Chip primitives                                                  */
/* --------------------------------------------------------------- */

// 1=High, 2=Medium, 3=Low, null=No priority. Was a 1..4 scale
// before the 2026-05-07 redesign — see the priority migration for
// the value remap.
const PRIORITY_LABEL: Record<number, string> = {
  1: "High",
  2: "Medium",
  3: "Low",
};
const PRIORITY_DOT_TONE: Record<number, string> = {
  1: "bg-danger",
  2: "bg-warning",
  3: "bg-text-3",
};

function PriorityChip({
  priority,
  onChange,
  disabled,
}: {
  priority: number | null;
  onChange: (p: number | null) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Click-outside to close.
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

  const label =
    priority == null ? "Priority" : PRIORITY_LABEL[priority] ?? "Priority";
  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        title={priority == null ? "No priority — click to set" : `Priority: ${label}`}
        className={cn(
          "flex items-center gap-1 rounded-sm border bg-bg-2 px-2 py-1 text-[11px]",
          priority == null
            ? "border-border text-text-1 hover:bg-bg-3"
            : "border-accent/40 text-text-0",
        )}
      >
        {priority == null ? (
          <Flag className="h-3 w-3 text-text-3" aria-hidden="true" />
        ) : (
          <span
            aria-hidden="true"
            className={cn(
              "h-2 w-2 rounded-full",
              PRIORITY_DOT_TONE[priority] ?? "bg-text-3",
            )}
          />
        )}
        <span>{label}</span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-1 w-36 overflow-hidden rounded-sm border border-border bg-bg-1 py-1 shadow-lg"
        >
          {[
            { val: 1, label: "High", tone: PRIORITY_DOT_TONE[1] },
            { val: 2, label: "Medium", tone: PRIORITY_DOT_TONE[2] },
            { val: 3, label: "Low", tone: PRIORITY_DOT_TONE[3] },
            { val: null, label: "No priority", tone: null },
          ].map((opt) => (
            <button
              key={String(opt.val)}
              type="button"
              role="menuitem"
              onClick={() => {
                onChange(opt.val);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-bg-2",
                priority === opt.val && "bg-bg-2 text-text-0",
              )}
            >
              {opt.tone ? (
                <span
                  aria-hidden="true"
                  className={cn("h-2 w-2 rounded-full", opt.tone)}
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full border border-text-3"
                />
              )}
              <span className="flex-1 text-text-1">{opt.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Quick presets shown above the calendar in the due-date popover.
 * Each preset resolves to a YYYY-MM-DD via `parseDueDate` so the
 * keyboard text-input shorthand and the click-list stay in sync.
 */
const DUE_PRESETS: { label: string; expr: string; hint?: string }[] = [
  { label: "Today", expr: "today" },
  { label: "Tomorrow", expr: "tomorrow" },
  { label: "This Friday", expr: "fri" },
  { label: "Next Monday", expr: "next mon" },
  { label: "In 1 week", expr: "in 7d" },
  { label: "End of month", expr: "eom" },
];

function DueChipPopover({
  iso,
  onChange,
  disabled,
}: {
  iso: string | null;
  onChange: (next: string | null) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const customRef = useRef<HTMLInputElement>(null);
  const datePickerId = useId();

  // Click-outside to close.
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

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Focus the custom-text input when the popover opens — power users
  // can just type "fri" and Enter without ever touching the mouse.
  useEffect(() => {
    if (open) {
      // Defer one tick so the input has mounted.
      setTimeout(() => customRef.current?.focus(), 0);
    }
  }, [open]);

  function pick(expr: string) {
    const parsed = parseDueDate(expr);
    if (parsed) {
      onChange(parsed);
      setOpen(false);
    }
  }

  function clear() {
    onChange(null);
    setOpen(false);
  }

  const label = iso ? formatDueLabel(iso) : "due";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={iso ? `Due ${iso}` : "Set due date"}
        className={cn(
          "flex items-center gap-1 rounded-sm border bg-bg-2 px-2 py-1 text-[11px]",
          iso
            ? "border-accent/40 text-text-0"
            : "border-border text-text-1 hover:bg-bg-3",
        )}
      >
        <Calendar className="h-3 w-3 text-text-3" aria-hidden="true" />
        <span>{label}</span>
        {iso ? (
          <span
            role="button"
            aria-label="Clear due date"
            onClick={(e) => {
              e.stopPropagation();
              clear();
            }}
            className="rounded-sm text-text-3 hover:text-text-0"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </span>
        ) : (
          <ChevronDown className="h-3 w-3 text-text-3" aria-hidden="true" />
        )}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Pick a due date"
          className="absolute left-0 top-full z-50 mt-1 w-60 overflow-hidden rounded-sm border border-border bg-bg-1 py-1 shadow-lg"
        >
          {/* Custom input — accepts any natural-language form parsed
              by `parseDueDate`, e.g. "tomorrow", "fri", "in 3d",
              "5/14". Enter commits. */}
          <div className="px-2 pb-1">
            <input
              ref={customRef}
              type="text"
              placeholder="Type: tomorrow · fri · in 3d"
              aria-label="Custom due date"
              className="h-7 w-full rounded-sm border border-border bg-bg-0 px-2 text-[11px] text-text-0 placeholder:text-text-3 focus:border-border-focus focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const v = (e.target as HTMLInputElement).value.trim();
                  if (v) pick(v);
                }
              }}
            />
          </div>
          <ul role="none" className="border-t border-border py-1">
            {DUE_PRESETS.map((p) => {
              const resolved = parseDueDate(p.expr);
              return (
                <li key={p.label} role="none">
                  <button
                    type="button"
                    onClick={() => pick(p.expr)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-1 text-left text-[11px] text-text-1 hover:bg-bg-2"
                  >
                    <span>{p.label}</span>
                    <span className="font-mono text-[10px] text-text-3">
                      {resolved ? formatDueLabel(resolved) : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {/* Native calendar picker — hand-pick a specific date when
              none of the presets match. We use the platform's date
              input so users get whatever calendar widget their
              browser/OS already knows. */}
          <div className="border-t border-border px-2 py-1.5">
            <label
              htmlFor={datePickerId}
              className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-text-3"
            >
              Pick a date
            </label>
            <input
              id={datePickerId}
              type="date"
              value={iso ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v) {
                  onChange(v);
                  setOpen(false);
                } else {
                  onChange(null);
                }
              }}
              className="h-7 w-full rounded-sm border border-border bg-bg-0 px-2 text-[11px] text-text-0 focus:border-border-focus focus:outline-none"
            />
          </div>
          {iso ? (
            <div className="border-t border-border px-2 py-1.5">
              <button
                type="button"
                onClick={clear}
                className="text-[11px] text-text-3 hover:text-text-1"
              >
                Clear due date
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AssigneeChip({
  members,
  selected,
  open,
  onToggleOpen,
  onChange,
  disabled,
}: {
  members: TaskComposerMember[];
  selected: string[];
  open: boolean;
  onToggleOpen: () => void;
  onChange: (ids: string[]) => void;
  disabled: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Click outside to close.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        onToggleOpen();
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onToggleOpen]);

  const selectedNames = useMemo(() => {
    return selected
      .map((id) => members.find((m) => m.user_id === id))
      .filter((m): m is TaskComposerMember => Boolean(m))
      .map((m) => m.full_name ?? "—");
  }, [selected, members]);

  function toggle(id: string) {
    onChange(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    );
  }

  const label =
    selected.length === 0
      ? "Assign"
      : selected.length === 1
        ? (selectedNames[0] ?? "1 assigned")
        : `${selected.length} assigned`;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={onToggleOpen}
        disabled={disabled}
        title="Assignees"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "flex items-center gap-1 rounded-sm border bg-bg-2 px-2 py-1 text-[11px] text-text-1 hover:bg-bg-3",
          selected.length > 0 ? "border-accent/40" : "border-border",
        )}
      >
        <UserPlus className="h-3 w-3 text-text-3" aria-hidden="true" />
        <span className="max-w-[120px] truncate">{label}</span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-1 max-h-60 w-56 overflow-y-auto rounded-sm border border-border bg-bg-1 py-1 shadow-lg"
        >
          {members.length === 0 ? (
            <p className="px-3 py-2 text-xs text-text-3">No members yet.</p>
          ) : (
            members.map((m) => {
              const checked = selected.includes(m.user_id);
              return (
                <button
                  key={m.user_id}
                  role="menuitem"
                  type="button"
                  onClick={() => toggle(m.user_id)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-bg-2",
                    checked && "bg-bg-2 text-text-0",
                  )}
                >
                  <span
                    className={cn(
                      "h-3 w-3 flex-shrink-0 rounded-sm border",
                      checked
                        ? "border-accent bg-accent"
                        : "border-border bg-bg-0",
                    )}
                    aria-hidden="true"
                  />
                  <span className="flex-1 truncate text-text-1">
                    {m.full_name ?? "—"}
                  </span>
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

function LabelsChip({
  labels,
  draft,
  onDraftChange,
  onCommit,
  onRemove,
  disabled,
}: {
  labels: string[];
  draft: string;
  onDraftChange: (v: string) => void;
  onCommit: () => void;
  onRemove: (l: string) => void;
  disabled: boolean;
}) {
  const id = useId();
  return (
    <span className="flex items-center gap-1 rounded-sm border border-border bg-bg-2 px-2 py-1 text-[11px] text-text-1">
      <label htmlFor={id} className="contents">
        <Tag className="h-3 w-3 text-text-3" aria-hidden="true" />
      </label>
      {labels.map((l) => (
        <span
          key={l}
          className="flex items-center gap-1 rounded-sm bg-bg-3 px-1 font-mono text-[10px] text-text-1"
        >
          {l}
          <button
            type="button"
            onClick={() => onRemove(l)}
            aria-label={`Remove ${l}`}
            disabled={disabled}
            className="text-text-3 hover:text-text-0"
          >
            <X className="h-2.5 w-2.5" aria-hidden="true" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            onCommit();
          } else if (
            e.key === "Backspace" &&
            draft === "" &&
            labels.length > 0
          ) {
            // Backspace on an empty draft pops the most recent label —
            // standard chip-input affordance.
            e.preventDefault();
            onRemove(labels[labels.length - 1]);
          }
        }}
        onBlur={onCommit}
        placeholder={labels.length === 0 ? "labels" : ""}
        aria-label="Labels — comma or Enter to add"
        className="w-16 bg-transparent text-[11px] outline-none placeholder:text-text-3"
        disabled={disabled}
      />
    </span>
  );
}
