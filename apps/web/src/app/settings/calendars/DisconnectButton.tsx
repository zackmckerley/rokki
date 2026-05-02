"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Unlink } from "lucide-react";

/**
 * Disconnect button — sends DELETE /api/v1/calendar/connections/:id
 * via fetch, then refreshes the page.
 *
 * Two-stage confirmation: first click shows "Confirm?" inline,
 * second click within 3s actually fires the request. After 3s of
 * inactivity it reverts. Avoids modal weight while still preventing
 * accidental disconnects.
 *
 * Trash icon previously used here was misleading — disconnect is a
 * soft revoke (sets revoked_at), not a permanent delete. Unlink reads
 * more accurately.
 */
export function DisconnectButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const revertTimer = useRef<number | null>(null);

  // Reset confirming state if user wanders off without acting on it.
  useEffect(() => {
    if (confirming) {
      revertTimer.current = window.setTimeout(() => setConfirming(false), 3000);
      return () => {
        if (revertTimer.current) window.clearTimeout(revertTimer.current);
      };
    }
  }, [confirming]);

  const fire = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/calendar/connections/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          let detail = `HTTP ${res.status}`;
          try {
            const body = (await res.json()) as {
              errors?: { message?: string }[];
            };
            if (body.errors?.[0]?.message) detail = body.errors[0].message;
          } catch {
            // ignore parse errors
          }
          setError(detail);
          return;
        }
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Network error");
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      {error ? (
        <span className="text-xs text-danger" role="alert">
          {error}
        </span>
      ) : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (pending) return;
          if (!confirming) {
            setConfirming(true);
            return;
          }
          fire();
          setConfirming(false);
        }}
        className={`flex items-center gap-1 rounded-sm border px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50 ${
          confirming
            ? "border-danger bg-danger-subtle text-danger hover:bg-danger/20"
            : "border-border text-danger hover:bg-danger-subtle"
        }`}
        aria-label={
          confirming ? "Confirm disconnect" : "Disconnect calendar"
        }
      >
        {pending ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        ) : (
          <Unlink className="h-3 w-3" aria-hidden="true" />
        )}
        {pending
          ? "Disconnecting…"
          : confirming
            ? "Confirm?"
            : "Disconnect"}
      </button>
    </div>
  );
}
