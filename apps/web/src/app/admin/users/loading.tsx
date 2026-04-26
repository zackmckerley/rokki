import {
  AdminSectionHeaderSkeleton,
  TableSkeleton,
  type SkeletonColumn,
} from "@/components/TableSkeleton";

/**
 * Mirrors the real /admin/users table — see AdminUsersClient.tsx. Column
 * widths match the most common content shape (email, name, timezone, last
 * seen, two badges, short id).
 */
const columns: SkeletonColumn[] = [
  { label: "Email", width: "w-44", mono: true },
  { label: "Name", width: "w-28" },
  { label: "Timezone", width: "w-24" },
  { label: "Last seen", width: "w-32" },
  { label: "Status", width: "w-16" },
  { label: "ID", width: "w-16", mono: true },
];

export default function AdminUsersLoading() {
  return (
    <div className="flex flex-col gap-4">
      <AdminSectionHeaderSkeleton withAction titleWidth="w-24" />
      <div
        className="flex flex-wrap items-center gap-2 rounded border border-border bg-bg-1 p-2"
        aria-busy="true"
      >
        <span className="h-7 flex-1 min-w-[240px] animate-pulse rounded-sm bg-bg-3" />
        <span className="h-7 w-44 animate-pulse rounded-sm bg-bg-3" />
      </div>
      <TableSkeleton rows={8} columns={columns} />
    </div>
  );
}
