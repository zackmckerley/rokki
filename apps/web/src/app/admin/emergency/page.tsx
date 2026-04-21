import { AdminSectionHeader } from "@/components/admin/primitives";
import { AdminEmergencyClient } from "./AdminEmergencyClient";

export const metadata = { title: "Emergency access — Admin" };
export const dynamic = "force-dynamic";

export default function AdminEmergencyPage() {
  return (
    <div className="flex flex-col gap-4">
      <AdminSectionHeader
        title="Emergency access"
        description="Time-boxed break-glass access to a terminal for support. Every grant requires a justification and is logged."
      />
      <AdminEmergencyClient />
    </div>
  );
}
