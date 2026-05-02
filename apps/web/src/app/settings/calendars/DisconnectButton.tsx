"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

/**
 * Disconnect button — sends DELETE /api/v1/calendar/connections/:id
 * via fetch, then refreshes the page so the connection drops off the
 * list.
 *
 * The original implementation relied on `formMethod="DELETE"` on a
 * <button>, which isn't valid HTML — formmethod only accepts get/post/
 * dialog, so browsers silently fell back to GET and the request failed
 * with ERR_INVALID_RESPONSE. fetch() is the right primitive here.
 */
export function DisconnectButton({ id }: { id: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      {error ? (
        <span className="text-xs text-danger" role="alert">
          {error}
        </span>
      ) : null}
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
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
                  if (body.errors?.[0]?.message)
                    detail = body.errors[0].message;
                } catch {
                  // Ignore body parse failures — the status is enough.
                }
                setError(detail);
                return;
              }
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Network error");
            }
          });
        }}
        className="flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-xs text-danger hover:bg-danger-subtle disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Disconnect calendar"
      >
        <Trash2 className="h-3 w-3" />
        {isPending ? "Disconnecting…" : "Disconnect"}
      </button>
    </div>
  );
}
