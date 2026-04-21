import { AdminSectionHeader } from "@/components/admin/primitives";
import { AdminWebhooksClient } from "./AdminWebhooksClient";

export const metadata = { title: "Webhooks — Admin" };
export const dynamic = "force-dynamic";

export default function AdminWebhooksPage() {
  return (
    <div className="flex flex-col gap-4">
      <AdminSectionHeader
        title="Webhooks"
        description="Outbound HTTP destinations subscribed to platform events. Delivery and retry are handled by the indexer."
      />
      <AdminWebhooksClient />
    </div>
  );
}
