"use client";

import { useFlag } from "@/lib/flags";
import { Wrench } from "lucide-react";

interface MaintenanceFlag {
  enabled?: boolean;
  message?: string;
}

/**
 * A flag-driven maintenance banner. Reads the `maintenance_mode` feature
 * flag (set in /admin/flags). When enabled, displays the message above
 * everything else. Doesn't block writes itself — the middleware does that
 * separately based on the same flag.
 */
export function MaintenanceBanner() {
  const flag = useFlag<MaintenanceFlag>("maintenance_mode", { enabled: false });
  if (!flag?.enabled) return null;
  const message = flag.message ?? "Rokki is in read-only maintenance mode.";
  return (
    <div
      role="alert"
      className="flex items-center gap-2 border-b border-warning/40 bg-warning-subtle px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-warning"
    >
      <Wrench className="h-3 w-3" />
      <span>{message}</span>
    </div>
  );
}
