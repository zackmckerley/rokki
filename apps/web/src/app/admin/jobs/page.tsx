import { AdminSectionHeader } from "@/components/admin/primitives";
import { AdminJobsClient } from "./AdminJobsClient";

export const metadata = { title: "Jobs — Admin" };
export const dynamic = "force-dynamic";

export default function AdminJobsPage() {
  return (
    <div className="flex flex-col gap-4">
      <AdminSectionHeader
        title="Jobs"
        description="Background queues processed by the worker. Replay a dead-letter row to send it back through the queue."
      />
      <AdminJobsClient />
    </div>
  );
}
