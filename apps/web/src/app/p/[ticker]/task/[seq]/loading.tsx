/**
 * Task detail loading skeleton. Most navigation into this page comes
 * from clicking a row in the task list — the previous page was already
 * rendered in the user's head as "the same list, just expanded." A
 * skeleton that matches the real layout (title, chips, description,
 * subtasks, comments) keeps the swap stable.
 */
export default function TaskDetailLoading() {
  return (
    <div className="flex h-[100dvh] flex-col">
      <header
        aria-busy="true"
        aria-label="Loading"
        className="flex h-11 flex-shrink-0 items-center gap-3 border-b border-border bg-bg-1 px-3"
      >
        <span className="h-4 w-44 animate-pulse rounded-sm bg-bg-3" />
      </header>
      <main className="flex flex-1 flex-col gap-3 p-4">
        {/* Title */}
        <span className="h-6 w-2/3 animate-pulse rounded-sm bg-bg-3" />
        {/* Chips strip */}
        <div className="flex items-center gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <span
              key={i}
              className="h-5 w-20 animate-pulse rounded-sm bg-bg-2"
            />
          ))}
        </div>
        {/* Description */}
        <div className="rounded border border-border bg-bg-1 p-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <span
              key={i}
              className="mt-2 block h-3 w-full animate-pulse rounded-sm bg-bg-3 first:mt-0"
              style={{ width: `${100 - i * 8}%` }}
            />
          ))}
        </div>
        {/* Subtasks */}
        <div className="flex flex-col gap-1 rounded border border-border bg-bg-1 p-3">
          <span className="mb-1 h-3 w-24 animate-pulse rounded-sm bg-bg-3" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 py-1">
              <span className="h-3 w-3 flex-shrink-0 animate-pulse rounded-sm bg-bg-3" />
              <span className="h-3 flex-1 animate-pulse rounded-sm bg-bg-3" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
