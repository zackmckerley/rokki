import {
  TableSkeleton,
  type SkeletonColumn,
} from "@/components/TableSkeleton";

/** /admin/activity: when, action, entity, actor, metadata. */
const columns: SkeletonColumn[] = [
  { label: "When", width: "w-32", mono: true },
  { label: "Action", width: "w-32", mono: true },
  { label: "Entity", width: "w-24" },
  { label: "Actor", width: "w-16", mono: true },
  { label: "Metadata", width: "w-56", mono: true },
];

export default function AdminActivityLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <header className="flex flex-col gap-2">
        <span className="h-6 w-24 animate-pulse rounded-sm bg-bg-3" />
        <span className="h-3 w-72 animate-pulse rounded-sm bg-bg-3" />
      </header>
      <TableSkeleton rows={12} columns={columns} />
    </div>
  );
}
