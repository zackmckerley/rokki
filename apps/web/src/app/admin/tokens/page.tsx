import { AdminSectionHeader } from "@/components/admin/primitives";
import { AdminTokensClient } from "./AdminTokensClient";

export const metadata = { title: "Tokens — Admin" };
export const dynamic = "force-dynamic";

export default function AdminTokensPage() {
  return (
    <div className="flex flex-col gap-4">
      <AdminSectionHeader
        title="Access tokens"
        description="Every personal access token, platform-wide. Revoke any token to immediately end its sessions."
      />
      <AdminTokensClient />
    </div>
  );
}
