/**
 * Messages inbox loading skeleton. Two columns to mirror the real
 * inbox: thread list on the left, conversation on the right.
 */
export default function MessagesLoading() {
  return (
    <div className="flex h-[100dvh] flex-col">
      <header
        aria-busy="true"
        aria-label="Loading"
        className="flex h-11 flex-shrink-0 items-center gap-3 border-b border-border bg-bg-1 px-3"
      >
        <span className="h-4 w-32 animate-pulse rounded-sm bg-bg-3" />
      </header>
      <div className="grid flex-1 grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-1 border-r border-border bg-bg-0 p-2">
          <span className="h-7 w-full animate-pulse rounded-sm bg-bg-2" />
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-sm border border-border bg-bg-1 px-2 py-1.5"
            >
              <span className="h-3 w-3 flex-shrink-0 animate-pulse rounded-full bg-bg-3" />
              <span className="h-3 flex-1 animate-pulse rounded-sm bg-bg-3" />
            </div>
          ))}
        </aside>
        <main className="flex flex-col gap-2 p-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-1 rounded border border-border bg-bg-1 px-3 py-2"
            >
              <span className="h-3 w-1/4 animate-pulse rounded-sm bg-bg-3" />
              <span className="h-3 w-3/4 animate-pulse rounded-sm bg-bg-3" />
            </div>
          ))}
        </main>
      </div>
    </div>
  );
}
