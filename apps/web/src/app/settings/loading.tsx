/**
 * Settings shell loading. Mirrors the real settings layout — left nav
 * with section links + a right-side form area.
 */
export default function SettingsLoading() {
  return (
    <div className="flex h-[100dvh] flex-col">
      <header
        aria-busy="true"
        aria-label="Loading"
        className="flex h-11 flex-shrink-0 items-center gap-3 border-b border-border bg-bg-1 px-3"
      >
        <span className="h-4 w-24 animate-pulse rounded-sm bg-bg-3" />
      </header>
      <div className="grid flex-1 grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-1 border-r border-border bg-bg-0 p-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <span
              key={i}
              className="h-5 w-full animate-pulse rounded-sm bg-bg-2"
            />
          ))}
        </aside>
        <main className="flex flex-col gap-3 p-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-3 rounded border border-border bg-bg-1 p-5"
            >
              <span className="h-3 w-32 animate-pulse rounded-sm bg-bg-3" />
              <span className="h-3 w-3/4 animate-pulse rounded-sm bg-bg-3" />
              <span className="h-9 w-full animate-pulse rounded-sm bg-bg-2" />
            </div>
          ))}
        </main>
      </div>
    </div>
  );
}
