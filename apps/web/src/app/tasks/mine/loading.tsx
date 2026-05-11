/**
 * Mine-tasks list loading skeleton. Same one is used at
 * /tasks/delegated via a re-export so both list pages share the same
 * placeholder shape.
 */
export default function TasksLoading() {
  return (
    <div className="flex h-[100dvh] flex-col">
      <header
        aria-busy="true"
        aria-label="Loading"
        className="flex h-11 flex-shrink-0 items-center gap-3 border-b border-border bg-bg-1 px-3"
      >
        <span className="h-4 w-32 animate-pulse rounded-sm bg-bg-3" />
      </header>
      <main className="flex flex-1 flex-col gap-2 p-3">
        {/* Filter chips strip */}
        <div className="flex items-center gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <span
              key={i}
              className="h-5 w-20 animate-pulse rounded-sm bg-bg-2"
            />
          ))}
        </div>
        {/* Rows */}
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-2 rounded-sm border border-border bg-bg-1 px-3 py-2"
          >
            <span className="h-3 w-3 flex-shrink-0 animate-pulse rounded-full bg-bg-3" />
            <span className="h-3 w-12 flex-shrink-0 animate-pulse rounded-sm bg-bg-3" />
            <span className="h-3 flex-1 animate-pulse rounded-sm bg-bg-3" />
            <span className="h-3 w-16 animate-pulse rounded-sm bg-bg-3" />
          </div>
        ))}
      </main>
    </div>
  );
}
