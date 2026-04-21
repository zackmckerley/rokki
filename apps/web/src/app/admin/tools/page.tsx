import { AdminSectionHeader } from "@/components/admin/primitives";
import { AdminToolsClient } from "./AdminToolsClient";

export const metadata = { title: "Tools — Admin" };
export const dynamic = "force-dynamic";

export default function AdminToolsPage() {
  return (
    <div className="flex flex-col gap-4">
      <AdminSectionHeader
        title="Tool moderation"
        description="Approve, disable, or feature published tools across the marketplace."
      />
      <AdminToolsClient />
    </div>
  );
}
