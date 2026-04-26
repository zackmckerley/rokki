import { CardSkeleton } from "@/components/TableSkeleton";

/**
 * Admin overview placeholder. Mirrors the real page's three regions: a
 * health strip across the top, the KPI grid (10 stat cards in a 3-up grid
 * on desktop), and the right-column quick-actions / recent-events panels.
 *
 * Card counts and grid breakpoints intentionally match `app/admin/page.tsx`
 * so swapping in real data doesn't shift anything.
 */
export default function AdminOverviewLoading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-2 rounded border border-border bg-bg-1 px-3 py-2"
            aria-busy="true"
          >
            <span className="h-2 w-2 flex-shrink-0 animate-pulse rounded-full bg-bg-3" />
            <span className="h-2 w-16 animate-pulse rounded-sm bg-bg-3" />
          </div>
        ))}
      </div>

      <header>
        <span
          className="block h-8 w-64 animate-pulse rounded-sm bg-bg-3"
          aria-busy="true"
          aria-label="Loading"
        />
        <span className="mt-2 block h-3 w-80 animate-pulse rounded-sm bg-bg-3" />
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <section className="lg:col-span-2 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        </section>
        <section className="flex flex-col gap-3">
          <PanelSkeleton title="Quick actions" rows={5} />
          <PanelSkeleton title="Recent events" rows={5} />
          <PanelSkeleton title="System" rows={4} />
        </section>
      </div>
    </div>
  );
}

function PanelSkeleton({ title, rows }: { title: string; rows: number }) {
  return (
    <section
      className="overflow-hidden rounded border border-border bg-bg-1"
      aria-busy="true"
      aria-label={`Loading ${title}`}
    >
      <header className="border-b border-border bg-bg-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-3">
        {title}
      </header>
      <ul className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, i) => (
          <li key={i} className="flex items-center gap-2 px-3 py-2">
            <span className="h-3 w-3 flex-shrink-0 animate-pulse rounded-sm bg-bg-3" />
            <span className="h-2.5 flex-1 animate-pulse rounded-sm bg-bg-3" />
            <span className="h-2 w-10 animate-pulse rounded-sm bg-bg-3" />
          </li>
        ))}
      </ul>
    </section>
  );
}

