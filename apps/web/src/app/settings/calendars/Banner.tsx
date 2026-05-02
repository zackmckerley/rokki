"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";

/**
 * Dismissible status banner that auto-clears its triggering query
 * params from the URL after first paint. Keeps `?connected=microsoft`
 * and `?error=...` from sticking forever in the address bar.
 */
export function Banner({
  variant,
  message,
}: {
  variant: "success" | "danger";
  message: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(true);

  // Strip the query params after a tick so a refresh doesn't replay the
  // banner. Doing this in a useEffect (vs. inside the dismiss handler)
  // means even users who navigate away mid-session get a clean URL.
  useEffect(() => {
    const t = window.setTimeout(() => router.replace(pathname), 100);
    return () => window.clearTimeout(t);
  }, [router, pathname]);

  if (!open) return null;
  const styles =
    variant === "success"
      ? "border-success-subtle bg-success-subtle text-success"
      : "border-danger-subtle bg-danger-subtle text-danger";
  const Icon = variant === "success" ? CheckCircle2 : AlertTriangle;
  return (
    <div
      className={`mb-4 inline-flex max-w-fit items-center gap-2 rounded border px-3 py-2 text-xs ${styles}`}
      role={variant === "danger" ? "alert" : "status"}
      aria-live={variant === "danger" ? "assertive" : "polite"}
    >
      <Icon className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label="Dismiss"
        className="rounded-sm p-0.5 opacity-70 hover:bg-bg-3 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
