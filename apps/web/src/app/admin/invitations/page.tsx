import { AdminSectionHeader } from "@/components/admin/primitives";
import { AdminInvitationsClient } from "./AdminInvitationsClient";

export const metadata = { title: "Invitations — Admin" };
export const dynamic = "force-dynamic";

export default function AdminInvitationsPage() {
  return (
    <div className="flex flex-col gap-4">
      <AdminSectionHeader
        title="Invitations"
        description="Pending invites across the platform. Resend, extend, or revoke."
      />
      <AdminInvitationsClient />
    </div>
  );
}
