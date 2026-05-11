import { CardSkeleton } from "@/components/TableSkeleton";

/**
 * Space landing loading skeleton. Mirrors the real page shell so the
 * route swap feels positionally stable: top bar + ticker + explorer
 * rail + center stack (terminals grid → tasks/members) + right rail
 * (lobby messages).
 */
export default function SpaceLoading() {
  return (
    <div className="flex h-[100dvh] flex-col">
      <header
        aria-busy="true"
        aria-label="Loading"
        className="flex h-11 flex-shrink-0 items-center gap-3 border-b border-border bg-bg-1 px-3"
      >
        <span className="h-4 w-40 animate-pulse rounded-sm bg-bg-3" />
      </header>
      <div className="flex h-8 flex-shrink-0 items-center gap-2 border-b border-border bg-bg-1 px-3">
        <span className="h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-bg-3" />
        <span className="h-2 w-1/2 animate-pulse rounded-sm bg-bg-3" />
      </div>
      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
        <aside className="hidden flex-col gap-2 border-r border-border bg-bg-0 p-3 lg:flex">
          {Array.from({ length: 6 }).map((_, i) => (
            <span
              key={i}
              className="h-4 w-full animate-pulse rounded-sm bg-bg-2"
            />
          ))}
        </aside>
        <main className="flex flex-col gap-3 p-3">
          {/* Terminals grid */}
          <div className="flex flex-col gap-2 rounded border border-border bg-bg-1 p-3">
            <span className="h-3 w-24 animate-pulse rounded-sm bg-bg-3" />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-2 rounded-sm border border-border bg-bg-2 p-3"
                >
                  <span className="h-3 w-1/2 animate-pulse rounded-sm bg-bg-3" />
                  <span className="h-3 w-3/4 animate-pulse rounded-sm bg-bg-3" />
                </div>
              ))}
            </div>
          </div>
          {/* Tasks + Members */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <CardSkeleton rows={6} />
            <CardSkeleton rows={6} />
          </div>
        </main>
        <aside className="hidden flex-col gap-3 p-3 lg:flex">
          <CardSkeleton rows={6} />
        </aside>
      </div>
    </div>
  );
}
