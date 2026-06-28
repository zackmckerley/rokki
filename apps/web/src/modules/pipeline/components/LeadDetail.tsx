"use client";

import { useEffect, useState } from "react";
import { X, Loader2, Trash2, Ban, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { LeadRow, PipelineRow } from "@/lib/pipeline/db";
import { getLead, updateLead, deleteLead, type LeadInput } from "../lib/client-api";
import { LeadForm } from "./LeadForm";

/** Drawer for one lead — edit + delete + mark-dead/reopen. (Promote-to-Terminal
 *  lands in the next phase.) */
export function LeadDetail({
  leadId,
  pipeline,
  onClose,
  onChanged,
}: {
  leadId: string;
  pipeline: PipelineRow;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [lead, setLead] = useState<LeadRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getLead(leadId)
      .then((l) => alive && setLead(l))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Failed"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [leadId]);

  async function save(patch: LeadInput) {
    setBusy(true);
    setError(null);
    try {
      await updateLead(leadId, patch);
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setBusy(false);
    }
  }

  async function setStatus(status: LeadRow["status"]) {
    setBusy(true);
    try {
      await updateLead(leadId, { status });
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update");
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteLead(leadId);
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-text-3">
          Lead
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="ml-auto rounded-sm p-1 text-text-2 hover:text-text-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-text-3">
            <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" />
          </div>
        ) : !lead ? (
          <p className="text-xs text-text-3">{error ?? "Not found."}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <LeadForm
              pipeline={pipeline}
              initial={lead}
              busy={busy}
              error={error}
              submitLabel="Save"
              onCancel={onClose}
              onSubmit={save}
            />
            <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
              {lead.status === "dead" ? (
                <Button size="sm" variant="ghost" onClick={() => setStatus("open")} disabled={busy}>
                  <RotateCcw className="h-3 w-3" /> Reopen
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setStatus("dead")} disabled={busy}>
                  <Ban className="h-3 w-3" /> Mark dead
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={remove} disabled={busy}>
                <Trash2 className="h-3 w-3" /> Delete
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
