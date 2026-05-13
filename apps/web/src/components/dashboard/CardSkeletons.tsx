/**
 * Per-card skeletons used as `<Suspense fallback>` for individual
 * dashboard cards. Distinct from the route-level `loading.tsx`
 * skeletons (those cover the whole page swap). These render only the
 * affected card's silhouette while it streams in, with the rest of
 * the dashboard already painted.
 *
 * Each shape mirrors its real card's outer chrome (DashboardCard
 * header + body padding) so the swap-in is positionally identical.
 */

function CardChrome({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="overflow-hidden rounded border border-border bg-bg-1"
      aria-busy="true"
      aria-label={`Loading ${title}`}
    >
      <header className="flex items-center justify-between border-b border-border bg-bg-2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-3">
        <div className="flex items-center gap-2">
          <span>{title}</span>
          <span className="h-2 w-4 animate-pulse rounded-sm bg-bg-3" />
        </div>
      </header>
      <div className="flex flex-col gap-1 px-3 py-2">{children}</div>
    </div>
  );
}

export function TasksCardSkeleton() {
  return (
    <CardChrome title="Tasks">
      {/* Filter chips row */}
      <div className="mb-1 flex items-center gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className="h-4 w-16 animate-pulse rounded-sm bg-bg-2" />
        ))}
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 py-1">
          <span className="h-3 w-3 flex-shrink-0 animate-pulse rounded-full bg-bg-3" />
          <span className="h-3 w-12 flex-shrink-0 animate-pulse rounded-sm bg-bg-3" />
          <span className="h-3 flex-1 animate-pulse rounded-sm bg-bg-3" />
          <span className="h-3 w-12 animate-pulse rounded-sm bg-bg-3" />
        </div>
      ))}
    </CardChrome>
  );
}

export function WeekCardSkeleton({
  range = "week",
}: {
  range?: "today" | "week" | "month";
}) {
  const title =
    range === "today"
      ? "Today"
      : range === "month"
        ? "Next 30 days"
        : "This week";
  return (
    <CardChrome title={title}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 py-1">
          <span className="h-3 w-10 flex-shrink-0 animate-pulse rounded-sm bg-bg-3" />
          <span className="h-3 w-3 flex-shrink-0 animate-pulse rounded-full bg-bg-3" />
          <span className="h-3 flex-1 animate-pulse rounded-sm bg-bg-3" />
        </div>
      ))}
    </CardChrome>
  );
}

/**
 * Ticker tape skeleton — fixed-height strip that matches the real
 * ticker's row so the dashboard's vertical layout doesn't jump when
 * the stream completes.
 */
export function TickerTapeSkeleton() {
  return (
    <div
      className="flex h-8 flex-shrink-0 items-center gap-2 border-b border-border bg-bg-1 px-3 text-xs text-text-3"
      aria-busy="true"
      aria-label="Loading recent activity"
    >
      <span className="h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-bg-3" />
      <span className="h-3 w-3 flex-shrink-0 animate-pulse rounded-sm bg-bg-3" />
      <span className="h-2 w-1/3 animate-pulse rounded-sm bg-bg-3" />
    </div>
  );
}
