import { AdminSectionHeader } from "@/components/admin/primitives";
import { AdminWebhooksClient } from "./AdminWebhooksClient";

export const metadata = { title: "Webhooks — Admin" };
export const dynamic = "force-dynamic";

export default function AdminWebhooksPage() {
  return (
    <div className="flex flex-col gap-4">
      <AdminSectionHeader
        title="Webhooks"
        description="Outbound HTTP destinations subscribed to platform events. Failed deliveries retry with exponential backoff (1m, 5m, 25m, 2h, 12h) before dead-lettering."
      />
      <AdminWebhooksClient />
    </div>
  );
}
