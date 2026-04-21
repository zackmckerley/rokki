import { AdminSectionHeader } from "@/components/admin/primitives";
import { AdminRateLimitsClient } from "./AdminRateLimitsClient";

export const metadata = { title: "Rate limits — Admin" };
export const dynamic = "force-dynamic";

export default function AdminRateLimitsPage() {
  return (
    <div className="flex flex-col gap-4">
      <AdminSectionHeader
        title="Rate limits"
        description="Recent hits grouped by bucket. Flush a (bucket, token) pair to unblock a stuck user."
      />
      <AdminRateLimitsClient />
    </div>
  );
}
