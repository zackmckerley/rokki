import {
  AdminSectionHeaderSkeleton,
  TableSkeleton,
  type SkeletonColumn,
} from "@/components/TableSkeleton";

const columns: SkeletonColumn[] = [
  { label: "Subject", width: "w-32" },
  { label: "Tool", width: "w-32" },
  { label: "Period", width: "w-12" },
  { label: "Used", width: "w-16", align: "right", mono: true },
  { label: "Limit", width: "w-16", align: "right", mono: true },
  { label: "Resets", width: "w-24" },
  { label: "Actions", width: "w-16", align: "right" },
];

export default function AdminQuotasLoading() {
  return (
    <div className="flex flex-col gap-4">
      <AdminSectionHeaderSkeleton titleWidth="w-20" descriptionWidth="w-80" />
      <TableSkeleton rows={5} columns={columns} />
    </div>
  );
}
