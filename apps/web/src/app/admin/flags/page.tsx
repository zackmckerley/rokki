import { AdminSectionHeader } from "@/components/admin/primitives";
import { AdminFlagsClient } from "./AdminFlagsClient";

export const metadata = { title: "Feature flags — Admin" };
export const dynamic = "force-dynamic";

export default function AdminFlagsPage() {
  return (
    <div className="flex flex-col gap-4">
      <AdminSectionHeader
        title="Feature flags"
        description="Typed key/value flags. Reachable from client code via `useFlag`. Set `maintenance_mode = { enabled: true, message: '…' }` to flip the read-only banner."
      />
      <AdminFlagsClient />
    </div>
  );
}
