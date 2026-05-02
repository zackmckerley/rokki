"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { AdminButton } from "@/components/admin/primitives";

/**
 * Manual refresh button for the operator console. Calls
 * router.refresh() which re-runs every server component on the page,
 * including the parallel count queries — same effect as a hard reload
 * but without the white flash. Auto-refresh / polling is intentionally
 * deferred to a follow-up issue so this PR stays scoped.
 */
export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <AdminButton
      variant="default"
      disabled={pending}
      onClick={() => {
        startTransition(() => router.refresh());
      }}
      title="Re-fetch counts"
    >
      {pending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <RefreshCw className="h-3 w-3" />
      )}
      {pending ? "Refreshing…" : "Refresh"}
    </AdminButton>
  );
}
