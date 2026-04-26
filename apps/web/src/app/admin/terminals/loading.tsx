import {
  TableSkeleton,
  type SkeletonColumn,
} from "@/components/TableSkeleton";

/** Matches /admin/terminals: ticker, name, space, status, created. */
const columns: SkeletonColumn[] = [
  { label: "Ticker", width: "w-12", mono: true },
  { label: "Name", width: "w-44" },
  { label: "Space", width: "w-28" },
  { label: "Status", width: "w-16" },
  { label: "Created", width: "w-20" },
];

export default function AdminTerminalsLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <header className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <span className="h-6 w-32 animate-pulse rounded-sm bg-bg-3" />
          <span className="h-3 w-44 animate-pulse rounded-sm bg-bg-3" />
        </div>
        <nav className="flex flex-wrap gap-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <span
              key={i}
              className="h-5 w-16 animate-pulse rounded-sm bg-bg-3"
            />
          ))}
        </nav>
      </header>
      <TableSkeleton rows={8} columns={columns} />
    </div>
  );
}
