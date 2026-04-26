"use client";

import {
  diffJson,
  shouldUseCharDiff,
  charDiff,
  formatJsonValue,
  type DiffEntry,
} from "@/lib/json-diff";
import { cn } from "@/lib/utils";

interface ActivityDiffProps {
  before: unknown;
  after: unknown;
  /** When true, render as a compact one-liner suitable for table rows. */
  compact?: boolean;
}

/**
 * Visualizes one trigger-emitted audit row's before → after diff.
 *
 *   - Skips fields that didn't change.
 *   - For short strings (≤200 chars on both sides) uses inline char-level
 *     diff: red strike on removals, green underline on additions.
 *   - For longer values or non-strings, falls back to "from X → Y".
 *   - In `compact` mode (admin table cells), only the changed field names
 *     are shown chip-style with a tiny ellipsized preview, and the full
 *     diff appears on hover via a `title`.
 *
 * Both before/after may be `null`/`undefined` if a row has no diff payload
 * (e.g., a trigger fired on an INSERT before this migration shipped). In
 * that case we render a neutral placeholder.
 */
export function ActivityDiff({ before, after, compact }: ActivityDiffProps) {
  if (before == null && after == null) {
    return (
      <span className="text-[11px] text-text-3">No before/after captured.</span>
    );
  }

  const diff = diffJson(before, after);
  if (diff.length === 0) {
    return (
      <span className="text-[11px] text-text-3">No fields changed.</span>
    );
  }

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1">
        {diff.map((entry) => (
          <DiffChip key={entry.key} entry={entry} />
        ))}
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {diff.map((entry) => (
        <li key={entry.key} className="text-[11px] leading-relaxed">
          <span className="mr-2 font-mono text-[10px] uppercase tracking-wide text-text-3">
            {entry.key}
          </span>
          <FieldDiff entry={entry} />
        </li>
      ))}
    </ul>
  );
}

function DiffChip({ entry }: { entry: DiffEntry }) {
  const beforeStr = formatJsonValue(entry.before);
  const afterStr = formatJsonValue(entry.after);
  return (
    <span
      title={`${entry.key}: ${beforeStr} → ${afterStr}`}
      className="inline-flex max-w-[220px] items-center gap-1 truncate rounded-sm border border-border bg-bg-2 px-1.5 py-0.5 font-mono text-[10px] text-text-2"
    >
      <span className="text-text-3">{entry.key}</span>
      <span className="text-accent">→</span>
      <span className="truncate">{afterStr || "—"}</span>
    </span>
  );
}

function FieldDiff({ entry }: { entry: DiffEntry }) {
  // Pure addition (key didn't exist before).
  if (entry.before === undefined) {
    return (
      <span>
        <span className="text-text-3">added: </span>
        <AddedSpan>{formatJsonValue(entry.after)}</AddedSpan>
      </span>
    );
  }
  // Pure removal (key removed from row).
  if (entry.after === undefined) {
    return (
      <span>
        <span className="text-text-3">removed: </span>
        <RemovedSpan>{formatJsonValue(entry.before)}</RemovedSpan>
      </span>
    );
  }

  if (shouldUseCharDiff(entry.before, entry.after)) {
    const segs = charDiff(entry.before as string, entry.after as string);
    return (
      <span className="font-mono text-[11px]">
        {segs.map((s, i) => {
          if (s.type === "same") {
            return (
              <span key={i} className="text-text-1">
                {s.text}
              </span>
            );
          }
          if (s.type === "removed") {
            return <RemovedSpan key={i}>{s.text}</RemovedSpan>;
          }
          return <AddedSpan key={i}>{s.text}</AddedSpan>;
        })}
      </span>
    );
  }

  // Fallback: from X → Y. Truncate huge JSON blobs so a 2KB description
  // change doesn't tank the render budget on a long timeline.
  const beforeStr = truncate(formatJsonValue(entry.before), 240);
  const afterStr = truncate(formatJsonValue(entry.after), 240);

  return (
    <span className="font-mono text-[11px]">
      <span className="text-text-3">from </span>
      <RemovedSpan>{beforeStr}</RemovedSpan>
      <span className="text-text-3"> to </span>
      <AddedSpan>{afterStr}</AddedSpan>
    </span>
  );
}

function RemovedSpan({ children }: { children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-sm bg-danger-subtle px-0.5 text-danger line-through decoration-danger/70",
      )}
    >
      {children}
    </span>
  );
}

function AddedSpan({ children }: { children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-sm bg-success-subtle px-0.5 text-success underline decoration-success/70",
      )}
    >
      {children}
    </span>
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}
