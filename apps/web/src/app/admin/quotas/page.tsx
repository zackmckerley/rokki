import { AdminSectionHeader } from "@/components/admin/primitives";
import { AdminQuotasClient } from "./AdminQuotasClient";

export const metadata = { title: "Quotas — Admin" };
export const dynamic = "force-dynamic";

export default function AdminQuotasPage() {
  return (
    <div className="flex flex-col gap-4">
      <AdminSectionHeader
        title="Quotas"
        description="Per-tool credit limits per user or per space. No row → no cap."
      />
      <AdminQuotasClient />
    </div>
  );
}
