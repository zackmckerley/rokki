import { AdminSectionHeader } from "@/components/admin/primitives";
import { AdminAnnouncementsClient } from "./AdminAnnouncementsClient";

export const metadata = { title: "Announcements — Admin" };
export const dynamic = "force-dynamic";

export default function AdminAnnouncementsPage() {
  return (
    <div className="flex flex-col gap-4">
      <AdminSectionHeader
        title="Announcements"
        description="Markdown messages broadcast to all users, just admins, or members of one space."
      />
      <AdminAnnouncementsClient />
    </div>
  );
}
