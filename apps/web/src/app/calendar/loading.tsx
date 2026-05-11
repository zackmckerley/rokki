/**
 * Calendar page loading. Calendars are visually busy enough that a
 * blank screen during nav is jarring; the skeleton just mirrors the
 * usual 7-column week grid.
 */
export default function CalendarLoading() {
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
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, day) => (
            <div
              key={day}
              className="flex h-44 flex-col gap-1 rounded border border-border bg-bg-1 p-2"
            >
              <span className="h-3 w-12 animate-pulse rounded-sm bg-bg-3" />
              {Array.from({ length: 3 }).map((_, j) => (
                <span
                  key={j}
                  className="h-3 w-full animate-pulse rounded-sm bg-bg-2"
                />
              ))}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
