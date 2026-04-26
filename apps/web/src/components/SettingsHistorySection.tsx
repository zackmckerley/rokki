"use client";

import { History } from "lucide-react";
import { HistoryTimeline } from "@/components/HistoryTimeline";

/**
 * Compact "History" section used in terminal & space settings pages and
 * other detail surfaces. Wraps <HistoryTimeline> with a header card so
 * the settings page doesn't need to import + style it from scratch.
 */
export function SettingsHistorySection({
  entityType,
  entityId,
  actorNames,
  title = "History",
  description = "Every change to this record, newest first. Click a row to see the field-by-field diff.",
}: {
  entityType: "task" | "terminal" | "space" | "file" | "comment";
  entityId: string;
  actorNames?: Record<string, string>;
  title?: string;
  description?: string;
}) {
  return (
    <section className="mt-6 rounded border border-border bg-bg-1 p-4">
      <header className="mb-3 flex items-start gap-2">
        <History className="mt-0.5 h-4 w-4 text-text-3" />
        <div>
          <h2 className="text-sm font-semibold text-text-0">{title}</h2>
          <p className="text-[11px] text-text-3">{description}</p>
        </div>
      </header>
      <HistoryTimeline
        entityType={entityType}
        entityId={entityId}
        actorNames={actorNames}
      />
    </section>
  );
}
