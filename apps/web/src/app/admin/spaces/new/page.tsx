import Link from "next/link";
import { AdminSectionHeader } from "@/components/admin/primitives";
import { NewSpaceForm } from "./NewSpaceForm";

export const metadata = { title: "New space — Admin" };

export default function NewSpacePage() {
  return (
    <div className="flex flex-col gap-4">
      <AdminSectionHeader
        title="New space"
        description="A space is a tenant: company, family, household. The initial owner becomes the only owner; you can add more later."
        actions={
          <Link
            href="/admin/spaces"
            className="text-xs text-text-3 hover:text-text-1"
          >
            ← back to spaces
          </Link>
        }
      />
      <NewSpaceForm />
    </div>
  );
}
