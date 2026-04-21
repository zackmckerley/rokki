import Link from "next/link";
import { Plus } from "lucide-react";
import { AdminSectionHeader, AdminButton } from "@/components/admin/primitives";
import { AdminSpacesClient } from "./AdminSpacesClient";

export const metadata = { title: "Spaces — Admin" };
export const dynamic = "force-dynamic";

export default function AdminSpacesPage() {
  return (
    <div className="flex flex-col gap-4">
      <AdminSectionHeader
        title="Spaces"
        description="Tenants. One space per company / family / household."
        actions={
          <Link href="/admin/spaces/new" className="no-underline">
            <AdminButton variant="accent">
              <Plus className="h-3 w-3" /> New space
            </AdminButton>
          </Link>
        }
      />
      <AdminSpacesClient />
    </div>
  );
}
