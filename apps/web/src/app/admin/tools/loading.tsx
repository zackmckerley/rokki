import {
  AdminSectionHeaderSkeleton,
  TableSkeleton,
  type SkeletonColumn,
} from "@/components/TableSkeleton";

const columns: SkeletonColumn[] = [
  { label: "Tool", width: "w-44" },
  { label: "Slug", width: "w-24", mono: true },
  { label: "Visibility", width: "w-16" },
  { label: "Status", width: "w-20" },
  { label: "Version", width: "w-12", mono: true },
  { label: "Updated", width: "w-20" },
  { label: "Actions", width: "w-28", align: "right" },
];

export default function AdminToolsLoading() {
  return (
    <div className="flex flex-col gap-4">
      <AdminSectionHeaderSkeleton titleWidth="w-36" descriptionWidth="w-80" />
      <div
        className="flex flex-wrap items-center gap-2 rounded border border-border bg-bg-1 p-2"
        aria-busy="true"
      >
        <span className="h-7 w-44 animate-pulse rounded-sm bg-bg-3" />
      </div>
      <TableSkeleton rows={6} columns={columns} />
    </div>
  );
}
