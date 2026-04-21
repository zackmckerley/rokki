import Link from "next/link";
import { AdminSectionHeader } from "@/components/admin/primitives";
import { NewUserForm } from "./NewUserForm";

export const metadata = { title: "New user — Admin" };

export default function NewUserPage() {
  return (
    <div className="flex flex-col gap-4">
      <AdminSectionHeader
        title="New user"
        description={
          <>
            Creates an auth.users + profiles row. The user lands via welcome
            email (or via the initial password you set).
          </>
        }
        actions={
          <Link
            href="/admin/users"
            className="text-xs text-text-3 hover:text-text-1"
          >
            ← back to users
          </Link>
        }
      />
      <NewUserForm />
    </div>
  );
}
