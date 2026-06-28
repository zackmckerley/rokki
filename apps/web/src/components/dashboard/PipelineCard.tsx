"use client";

import { DashboardCard } from "./DashboardCard";
import { PipelineBoard } from "@/modules/pipeline/components/PipelineBoard";

/**
 * Dashboard Pipeline panel — the deal-flow board (kanban by stage). The board
 * carries its own space picker + add control; this just wraps it in the panel
 * shell. Maximize the panel to see the full board side-by-side.
 */
export function PipelineCard() {
  return (
    <DashboardCard
      title="Pipeline"
      expandHref={null}
      bodyClassName="flex min-h-0 flex-col overflow-hidden"
    >
      <PipelineBoard />
    </DashboardCard>
  );
}
