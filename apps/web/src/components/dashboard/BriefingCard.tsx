"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, X, AlertTriangle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

interface Briefing {
  date: string;
  due_today: number;
  overdue: number;
  mentions_24h: number;
  tasks_completed_24h: number;
  tasks_created_24h: number;
  files_uploaded_24h: number;
  next_up: {
    id: string;
    title: string;
    due_date: string | null;
    terminal_ticker: string | null;
  } | null;
}

/**
 * Morning briefing — deterministic heuristics, no LLM spend. Renders once
 * per calendar day; dismisses persist to `profiles.settings.briefing_dismissed_on`
 * so the card stays out of the way after you've read it.
 */
export function BriefingCard({
  userName,
  dismissedOn,
}: {
  userName: string;
  /** ISO date string (YYYY-MM-DD) or null. */
  dismissedOn: string | null;
}) {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    void fetch("/api/v1/briefing", { credentials: "include" })
      .then((r) => r.json() as Promise<{ data?: Briefing }>)
      .then((body) => {
        if (!body.data) return;
        setBriefing(body.data);
        if (dismissedOn === body.data.date) setHidden(true);
      });
  }, [dismissedOn]);

  async function dismiss() {
    if (!briefing) return;
    setHidden(true);
    try {
      const supa = createClient();
      const {
        data: { user },
      } = await supa.auth.getUser();
      if (!user) return;
      const { data: current } = await supa
        .from("profiles")
        .select("settings")
        .eq("user_id", user.id)
        .maybeSingle();
      const next = {
        ...(((current as { settings?: Record<string, unknown> } | null)?.settings) ?? {}),
        briefing_dismissed_on: briefing.date,
      };
      await supa
        .from("profiles")
        // @ts-expect-error generic update collapses to never
        .update({ settings: next })
        .eq("user_id", user.id);
    } catch {
      /* dismiss is best-effort; don't block UI on it */
    }
  }

  if (!briefing || hidden) return null;

  const greeting = greetingFor(new Date());
  const nothingToReport =
    briefing.due_today === 0 &&
    briefing.overdue === 0 &&
    briefing.mentions_24h === 0 &&
    briefing.tasks_completed_24h === 0 &&
    briefing.files_uploaded_24h === 0;
  if (nothingToReport) return null;

  return (
    <section
      className="flex items-start gap-3 rounded border border-accent-subtle bg-accent-subtle/40 p-3"
      aria-label="Morning briefing"
    >
      <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" aria-hidden="true" />
      <div className="flex-1 min-w-0 text-xs text-text-1">
        <p className="font-semibold text-text-0">
          {greeting}, {userName}.
        </p>
        <p className="mt-1 leading-relaxed">{summarize(briefing)}</p>
        {briefing.next_up && briefing.next_up.terminal_ticker ? (
          <Link
            href={`/p/${briefing.next_up.terminal_ticker}`}
            className="mt-2 inline-flex items-center gap-1 text-accent hover:underline"
          >
            Up next: &ldquo;{briefing.next_up.title}&rdquo;
            <ArrowRight className="h-3 w-3" />
          </Link>
        ) : null}
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="rounded-sm p-1 text-text-3 hover:bg-bg-2 hover:text-text-1"
      >
        <X className="h-3 w-3" />
      </button>
    </section>
  );
}

/** Convert the raw briefing counts into a calm, permissive sentence. */
function summarize(b: Briefing): string {
  const parts: string[] = [];
  if (b.overdue > 0) {
    parts.push(
      `${b.overdue} ${plural("task", b.overdue)} overdue`,
    );
  }
  if (b.due_today > 0) {
    parts.push(
      `${b.due_today} due today`,
    );
  }
  if (b.mentions_24h > 0) {
    parts.push(
      `${b.mentions_24h} new ${plural("mention", b.mentions_24h)} for you`,
    );
  }
  const activity: string[] = [];
  if (b.tasks_completed_24h > 0)
    activity.push(
      `${b.tasks_completed_24h} ${plural("task", b.tasks_completed_24h)} closed`,
    );
  if (b.files_uploaded_24h > 0)
    activity.push(
      `${b.files_uploaded_24h} ${plural("file", b.files_uploaded_24h)} uploaded`,
    );
  if (b.tasks_created_24h > 0)
    activity.push(
      `${b.tasks_created_24h} new`,
    );
  if (activity.length > 0) parts.push(`${activity.join(", ")} in the last day`);
  return parts.length > 0 ? parts.join(" · ") : "You're clear.";
}

function plural(w: string, n: number): string {
  return n === 1 ? w : `${w}s`;
}

function greetingFor(now: Date): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

void cn;
