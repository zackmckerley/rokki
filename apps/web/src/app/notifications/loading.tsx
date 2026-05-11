/**
 * Notifications page loading skeleton — same shape as the real
 * grouped list (terminal headers + a few rows per group).
 */
export default function NotificationsLoading() {
  return (
    <div className="flex h-[100dvh] flex-col">
      <header
        aria-busy="true"
        aria-label="Loading"
        className="flex h-11 flex-shrink-0 items-center gap-3 border-b border-border bg-bg-1 px-3"
      >
        <span className="h-4 w-32 animate-pulse rounded-sm bg-bg-3" />
      </header>
      <main className="flex flex-1 flex-col gap-3 p-4">
        {Array.from({ length: 3 }).map((_, g) => (
          <div key={g} className="flex flex-col gap-1">
            <span className="h-3 w-32 animate-pulse rounded-sm bg-bg-3" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded border border-border bg-bg-1 px-3 py-2"
              >
                <span className="mt-1 h-2 w-2 flex-shrink-0 animate-pulse rounded-full bg-bg-3" />
                <div className="flex flex-1 flex-col gap-1">
                  <span className="h-3 w-2/3 animate-pulse rounded-sm bg-bg-3" />
                  <span className="h-3 w-full animate-pulse rounded-sm bg-bg-3" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </main>
    </div>
  );
}
