import { AdminSectionHeader } from "@/components/admin/primitives";
import { AdminFailedLoginsClient } from "./AdminFailedLoginsClient";

export const metadata = { title: "Failed logins — Admin" };
export const dynamic = "force-dynamic";

export default function AdminFailedLoginsPage() {
  return (
    <div className="flex flex-col gap-4">
      <AdminSectionHeader
        title="Failed logins"
        description="Aggregated from rate-limit hits. Use the Rate-limit inspector to flush a stuck (bucket, token) pair."
      />
      <AdminFailedLoginsClient />
    </div>
  );
}
