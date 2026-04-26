"use client";

import { useState } from "react";
import { Trash2, RefreshCw } from "lucide-react";
import { AdminButton, AdminPanel } from "@/components/admin/primitives";
import { toast } from "@/lib/toast";

/**
 * Storage maintenance ops — orphan sweep + virus-scan re-queue. Both
 * are idempotent and capped server-side, so admins can hammer the
 * buttons without breaking anything. Result message shows how many
 * rows were touched.
 */
export function StorageOps() {
  const [busy, setBusy] = useState<string | null>(null);

  async function cleanupOrphans() {
    if (
      !confirm(
        "Soft-delete files attached to terminals archived ≥ 30 days ago? Up to 500 per call. Reversible by clearing files.deleted_at via SQL.",
      )
    )
      return;
    setBusy("orphans");
    try {
      const r = await fetch("/api/v1/admin/storage/cleanup-orphans", {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) {
        toast.error(await msg(r));
        return;
      }
      const body = (await r.json()) as {
        data: { swept: number; capped: boolean };
      };
      toast.success(
        `Swept ${body.data.swept} orphaned file${body.data.swept === 1 ? "" : "s"}${body.data.capped ? " (capped — run again to continue)" : ""}.`,
      );
    } finally {
      setBusy(null);
    }
  }

  async function rescan(scope: "stuck" | "all") {
    if (
      scope === "all" &&
      !confirm(
        "Re-queue every file currently 'pending' or 'skipped' for virus scanning?",
      )
    )
      return;
    setBusy(`rescan-${scope}`);
    try {
      const r = await fetch(
        `/api/v1/admin/storage/rescan?scope=${scope}`,
        { method: "POST", credentials: "include" },
      );
      if (!r.ok) {
        toast.error(await msg(r));
        return;
      }
      const body = (await r.json()) as { data: { requeued: number } };
      toast.success(
        `Re-queued ${body.data.requeued} file${body.data.requeued === 1 ? "" : "s"} for virus scanning.`,
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <AdminPanel title="Maintenance">
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <AdminButton
            variant="danger"
            disabled={busy === "orphans"}
            onClick={cleanupOrphans}
          >
            <Trash2 className="h-3 w-3" />
            {busy === "orphans" ? "Sweeping…" : "Cleanup orphans (30d+)"}
          </AdminButton>
          <AdminButton
            disabled={busy === "rescan-stuck"}
            onClick={() => void rescan("stuck")}
          >
            <RefreshCw className="h-3 w-3" />
            {busy === "rescan-stuck" ? "Re-queuing…" : "Re-queue stuck scans"}
          </AdminButton>
          <AdminButton
            disabled={busy === "rescan-all"}
            onClick={() => void rescan("all")}
          >
            <RefreshCw className="h-3 w-3" />
            {busy === "rescan-all" ? "Re-queuing…" : "Re-queue all scans"}
          </AdminButton>
        </div>
        <p className="text-[11px] text-text-3">
          Orphans = files attached to terminals archived for 30+ days.
          Stuck scans = files whose virus_scan_status has been
          &quot;pending&quot; for 1h+ (likely the indexer dropped them).
        </p>
      </div>
    </AdminPanel>
  );
}

async function msg(r: Response): Promise<string> {
  try {
    const body = (await r.json()) as { errors?: { message: string }[] };
    return body.errors?.[0]?.message ?? `HTTP ${r.status}`;
  } catch {
    return `HTTP ${r.status}`;
  }
}
