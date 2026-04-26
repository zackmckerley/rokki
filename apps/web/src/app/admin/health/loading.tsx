import {
  AdminSectionHeaderSkeleton,
  TableSkeleton,
  type SkeletonColumn,
} from "@/components/TableSkeleton";

const queueColumns: SkeletonColumn[] = [
  { label: "Queue", width: "w-56" },
  { label: "Depth", width: "w-12", align: "right", mono: true },
];

const rowsColumns: SkeletonColumn[] = [
  { label: "Table", width: "w-40", mono: true },
  { label: "Rows", width: "w-16", align: "right", mono: true },
];

export default function AdminHealthLoading() {
  return (
    <div className="flex flex-col gap-4">
      <AdminSectionHeaderSkeleton titleWidth="w-20" descriptionWidth="w-80" />
      <TableSkeleton title="Queues" rows={3} columns={queueColumns} />
      <TableSkeleton title="Row counts" rows={12} columns={rowsColumns} />
    </div>
  );
}
