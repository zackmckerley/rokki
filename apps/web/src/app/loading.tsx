import { CardSkeleton } from "@/components/TableSkeleton";

/**
 * Dashboard route loading skeleton. The single biggest navigation-feel
 * fix in an App Router app: without a `loading.tsx`, soft navigations
 * leave the previous page on screen while the next one server-renders,
 * which reads as "the click did nothing." A skeleton makes the click
 * feel instant — the route swap happens immediately, real content
 * streams in over the placeholder.
 *
 * Mirrors `app/page.tsx`'s layout so the swap is positionally stable:
 *   - top bar
 *   - ticker tape strip
 *   - three-column shell: explorer rail / center cards / messages rail
 *
 * Counts and breakpoints intentionally match the real page so nothing
 * jumps when data lands.
 */
export default function DashboardLoading() {
  return (
    <div className="flex h-[100dvh] flex-col">
      {/* Top bar */}
      <header
        aria-busy="true"
        aria-label="Loading"
        className="flex h-11 flex-shrink-0 items-center gap-3 border-b border-border bg-bg-1 px-3"
      >
        <span className="h-4 w-20 animate-pulse rounded-sm bg-bg-3" />
        <span className="h-3 w-60 animate-pulse rounded-sm bg-bg-3" />
      </header>

      {/* Ticker tape */}
      <div className="flex h-8 flex-shrink-0 items-center gap-2 border-b border-border bg-bg-1 px-3">
        <span className="h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-bg-3" />
        <span className="h-2 w-3/4 animate-pulse rounded-sm bg-bg-3" />
      </div>

      {/* Shell — explorer / center / messages */}
      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
        {/* Explorer rail */}
        <aside className="hidden flex-col gap-2 border-r border-border bg-bg-0 p-3 lg:flex">
          <span className="h-3 w-20 animate-pulse rounded-sm bg-bg-3" />
          <span className="h-7 w-full animate-pulse rounded-sm bg-bg-2" />
          {Array.from({ length: 5 }).map((_, i) => (
            <span
              key={i}
              className="h-4 w-full animate-pulse rounded-sm bg-bg-2"
            />
          ))}
        </aside>

        {/* Center column — Briefing, Week, Tasks */}
        <main className="flex flex-col gap-3 p-3">
          <CardSkeleton rows={3} />
          <CardSkeleton rows={6} />
          <CardSkeleton rows={8} />
        </main>

        {/* Right rail — Messages */}
        <aside className="hidden flex-col gap-3 p-3 lg:flex">
          <CardSkeleton rows={6} />
        </aside>
      </div>
    </div>
  );
}
