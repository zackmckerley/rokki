import { CardSkeleton } from "@/components/TableSkeleton";

/**
 * Terminal page loading skeleton. Renders the same shell + F-key
 * function bar + tasks pane area as the real page so the swap feels
 * stable. Without this the dashboard sat on screen while the terminal
 * page server-rendered — multi-hundred-ms freeze on click.
 */
export default function TerminalLoading() {
  return (
    <div className="flex h-[100dvh] flex-col">
      <header
        aria-busy="true"
        aria-label="Loading"
        className="flex h-11 flex-shrink-0 items-center gap-3 border-b border-border bg-bg-1 px-3"
      >
        <span className="h-4 w-32 animate-pulse rounded-sm bg-bg-3" />
        <span className="h-3 w-48 animate-pulse rounded-sm bg-bg-3" />
      </header>
      <div className="flex h-8 flex-shrink-0 items-center gap-2 border-b border-border bg-bg-1 px-3">
        <span className="h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-bg-3" />
        <span className="h-2 w-2/3 animate-pulse rounded-sm bg-bg-3" />
      </div>

      {/* Function key bar */}
      <div className="flex h-7 flex-shrink-0 items-center gap-2 border-b border-border bg-bg-1 px-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <span
            key={i}
            className="h-4 w-12 animate-pulse rounded-sm bg-bg-2"
          />
        ))}
      </div>

      {/* Shell: explorer / pane / right rail */}
      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)_300px]">
        <aside className="hidden flex-col gap-2 border-r border-border bg-bg-0 p-3 lg:flex">
          {Array.from({ length: 6 }).map((_, i) => (
            <span
              key={i}
              className="h-4 w-full animate-pulse rounded-sm bg-bg-2"
            />
          ))}
        </aside>
        <main className="flex flex-col gap-2 border-r border-border p-3">
          {/* Task list rows */}
          <span className="h-4 w-40 animate-pulse rounded-sm bg-bg-3" />
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-sm border border-border bg-bg-1 px-2 py-1.5"
            >
              <span className="h-3 w-3 flex-shrink-0 animate-pulse rounded-full bg-bg-3" />
              <span className="h-3 flex-1 animate-pulse rounded-sm bg-bg-3" />
              <span className="h-3 w-12 animate-pulse rounded-sm bg-bg-3" />
            </div>
          ))}
        </main>
        <aside className="hidden flex-col gap-3 p-3 lg:flex">
          <CardSkeleton rows={4} />
        </aside>
      </div>
    </div>
  );
}
