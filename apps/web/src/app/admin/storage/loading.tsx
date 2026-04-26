import {
  AdminSectionHeaderSkeleton,
  TableSkeleton,
  type SkeletonColumn,
} from "@/components/TableSkeleton";

const usageColumns: SkeletonColumn[] = [
  { label: "Space", width: "w-40" },
  { label: "Files", width: "w-12", align: "right", mono: true },
  { label: "Total bytes", width: "w-24", align: "right", mono: true },
  { label: "Pretty", width: "w-16", align: "right" },
];

const largestColumns: SkeletonColumn[] = [
  { label: "File", width: "w-56" },
  { label: "Terminal", width: "w-16", mono: true },
  { label: "Size", width: "w-16", align: "right", mono: true },
  { label: "Uploaded", width: "w-32" },
];

export default function AdminStorageLoading() {
  return (
    <div className="flex flex-col gap-4">
      <AdminSectionHeaderSkeleton titleWidth="w-20" descriptionWidth="w-80" />
      <TableSkeleton title="Usage by space" rows={5} columns={usageColumns} />
      <TableSkeleton
        title="Largest files (top 50)"
        rows={8}
        columns={largestColumns}
      />
    </div>
  );
}
