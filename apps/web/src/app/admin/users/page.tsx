import Link from "next/link";
import { UserPlus } from "lucide-react";
import { AdminSectionHeader, AdminButton } from "@/components/admin/primitives";
import { AdminUsersClient } from "./AdminUsersClient";

export const metadata = { title: "Users — Admin" };
export const dynamic = "force-dynamic";

/**
 * Admin user list. Data is loaded client-side so the search field can
 * re-query without a full page round-trip. Server-rendered page is just
 * the shell.
 */
export default async function AdminUsersPage() {
  return (
    <div className="flex flex-col gap-4">
      <AdminSectionHeader
        title="Users"
        description="Create, edit, suspend, delete. Every change is audited in Activity."
        actions={
          <Link href="/admin/users/new" className="no-underline">
            <AdminButton variant="accent">
              <UserPlus className="h-3 w-3" /> New user
            </AdminButton>
          </Link>
        }
      />
      <AdminUsersClient />
    </div>
  );
}
