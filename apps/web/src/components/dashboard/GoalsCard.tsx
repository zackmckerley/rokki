"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Target } from "lucide-react";
import { DashboardCard } from "./DashboardCard";
import { createClient } from "@/lib/supabase/client";

/**
 * Dashboard Goals panel. Shows how many goal areas (categories) the viewer
 * can see across their spaces/terminals; the full per-scope logging view
 * lives at /app/goals. RLS scopes the count to what the user can already see.
 */
export function GoalsCard() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    supabase
      .from("goals_categories")
      .select("id", { count: "exact", head: true })
      .is("archived_at", null)
      .then(({ count: n }) => {
        if (active) setCount(n ?? 0);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <DashboardCard
      title="Goals"
      count={count ?? undefined}
      expandHref="/app/goals"
    >
      {count === null ? (
        <p className="px-3 py-4 text-center text-xs text-text-3">Loading…</p>
      ) : count === 0 ? (
        <Empty />
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 p-5 text-center">
          <Target className="h-5 w-5 text-accent" aria-hidden="true" />
          <p className="text-sm text-text-0">
            {count} goal {count === 1 ? "area" : "areas"}
          </p>
          <p className="text-xs text-text-3">Weekly targets with daily entries.</p>
          <Link
            href="/app/goals"
            className="mt-1 rounded-sm border border-border bg-bg-2 px-2 py-1 text-xs text-text-1 hover:bg-bg-3"
          >
            Open Goals
          </Link>
        </div>
      )}
    </DashboardCard>
  );
}

function Empty() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
      <Target className="h-5 w-5 text-text-3" aria-hidden="true" />
      <p className="text-xs text-text-2">No goals yet.</p>
      <p className="text-xs text-text-3">
        Set weekly numeric targets and log daily progress.
      </p>
      <Link
        href="/app/goals"
        className="mt-1 rounded-sm border border-border bg-bg-2 px-2 py-1 text-xs text-text-1 hover:bg-bg-3"
      >
        Open Goals
      </Link>
    </div>
  );
}
