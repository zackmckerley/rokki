import {
  AdminSectionHeaderSkeleton,
  TableSkeleton,
  type SkeletonColumn,
} from "@/components/TableSkeleton";

const columns: SkeletonColumn[] = [
  { label: "Name", width: "w-40" },
  { label: "Slug", width: "w-24", mono: true },
  { label: "Status", width: "w-16" },
  { label: "Created", width: "w-24" },
];

export default function AdminSpacesLoading() {
  return (
    <div className="flex flex-col gap-4">
      <AdminSectionHeaderSkeleton withAction titleWidth="w-28" />
      <div
        className="flex flex-wrap items-center gap-2 rounded border border-border bg-bg-1 p-2"
        aria-busy="true"
      >
        <span className="h-7 flex-1 min-w-[240px] animate-pulse rounded-sm bg-bg-3" />
        <span className="h-7 w-44 animate-pulse rounded-sm bg-bg-3" />
      </div>
      <TableSkeleton rows={6} columns={columns} />
    </div>
  );
}
