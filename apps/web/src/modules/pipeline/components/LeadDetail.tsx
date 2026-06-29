"use client";

import { useEffect, useState } from "react";
import {
  X,
  Loader2,
  Trash2,
  Ban,
  RotateCcw,
  ArrowUpRight,
  Plus,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { LeadRow, PipelineRow } from "@/lib/pipeline/db";
import { terminalGateStage } from "@/lib/pipeline/templates";
import {
  getLead,
  updateLead,
  deleteLead,
  getLeadContacts,
  addLeadContact,
  removeLeadContact,
  promoteLead,
  type LeadInput,
  type LeadContact,
} from "../lib/client-api";
import { listContacts, type ContactListItem } from "@/modules/contacts/lib/client-api";
import { LeadForm } from "./LeadForm";

const sectionLabel = "text-[10px] font-semibold uppercase tracking-wide text-text-3";
const ROLES = ["", "seller", "broker", "attorney", "title", "lender", "partner", "other"];

/** Drawer for one lead — edit, linked contacts, promote-to-Terminal, and the
 *  dead/reopen/delete actions. */
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

  const [contacts, setContacts] = useState<LeadContact[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQ, setPickerQ] = useState("");
  const [pickerResults, setPickerResults] = useState<ContactListItem[]>([]);

  const [promoteMsg, setPromoteMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([getLead(leadId), getLeadContacts(leadId).catch(() => [])])
      .then(([l, cs]) => {
        if (!alive) return;
        setLead(l);
        setContacts(cs);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Failed"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [leadId]);

  // Debounced contact search for the picker.
  useEffect(() => {
    if (!pickerOpen) return;
    const t = setTimeout(() => {
      listContacts({ q: pickerQ.trim() || undefined, limit: 8 })
        .then(setPickerResults)
        .catch(() => setPickerResults([]));
    }, 200);
    return () => clearTimeout(t);
  }, [pickerOpen, pickerQ]);

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

  async function linkContact(c: ContactListItem) {
    try {
      const next = await addLeadContact(leadId, c.id);
      setContacts(next);
      setPickerOpen(false);
      setPickerQ("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not link contact");
    }
  }

  async function unlinkContact(contactId: string) {
    try {
      await removeLeadContact(leadId, contactId);
      setContacts((prev) => prev.filter((c) => c.contact_id !== contactId));
    } catch {
      /* keep it; non-fatal */
    }
  }

  async function setRole(contactId: string, role: string) {
    // addLeadContact upserts, so re-linking with a new role just updates it.
    try {
      const next = await addLeadContact(leadId, contactId, role || null);
      setContacts(next);
    } catch {
      /* non-fatal */
    }
  }

  async function promote() {
    setBusy(true);
    setError(null);
    try {
      const res = await promoteLead(leadId);
      setPromoteMsg(`Created terminal ${res.terminal.ticker}`);
      onChanged();
      // Give the user a beat to see the ticker, then close.
      setTimeout(onClose, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not promote");
      setBusy(false);
    }
  }

  const gate = terminalGateStage(pipeline.stages);
  const stageIdx = (key: string) => pipeline.stages.findIndex((s) => s.key === key);
  const canPromote =
    lead != null &&
    !lead.promoted_terminal_id &&
    lead.status !== "converted" &&
    gate != null &&
    stageIdx(lead.stage) >= stageIdx(gate.key);
  const alreadyTerminal = lead?.status === "converted" || lead?.promoted_terminal_id;

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
            {/* Promote banner */}
            {(canPromote || alreadyTerminal) && (
              <div className="rounded border border-border bg-bg-2 p-2">
                {alreadyTerminal ? (
                  <p className="text-2xs text-accent">
                    {promoteMsg ?? "This lead is now a Terminal."}
                  </p>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 text-2xs text-text-2">
                      At the {gate?.label} gate — ready to go hard?
                    </span>
                    <Button size="sm" onClick={promote} disabled={busy}>
                      <ArrowUpRight className="h-3 w-3" /> Promote to Terminal
                    </Button>
                  </div>
                )}
              </div>
            )}

            <LeadForm
              pipeline={pipeline}
              initial={lead}
              busy={busy}
              error={error}
              submitLabel="Save"
              onCancel={onClose}
              onSubmit={save}
            />

            {/* Contacts */}
            <div className="flex flex-col gap-1.5 border-t border-border/40 pt-2">
              <div className="flex items-center gap-2">
                <span className={sectionLabel}>Contacts</span>
                <button
                  type="button"
                  onClick={() => setPickerOpen((o) => !o)}
                  className="ml-auto flex items-center gap-0.5 text-2xs text-text-3 hover:text-text-1"
                >
                  <Plus className="h-3 w-3" /> Link
                </button>
              </div>
              {contacts.length === 0 && !pickerOpen && (
                <p className="text-2xs text-text-3">No contacts linked.</p>
              )}
              {contacts.map((c) => (
                <div key={c.contact_id} className="flex items-center gap-2 text-xs text-text-1">
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <select
                    value={c.role ?? ""}
                    onChange={(e) => setRole(c.contact_id, e.target.value)}
                    aria-label="Role"
                    className="rounded border border-border bg-bg-2 px-1 py-0.5 text-[9px] uppercase tracking-wide text-text-3 outline-none focus:border-border-focus"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r || "role"}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => unlinkContact(c.contact_id)}
                    aria-label="Unlink"
                    className="rounded-sm p-0.5 text-text-3 hover:text-danger"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {pickerOpen && (
                <div className="rounded border border-border bg-bg-1 p-1.5">
                  <div className="flex items-center gap-1.5 rounded border border-border bg-bg-2 px-2 py-1 focus-within:border-border-focus">
                    <Search className="h-3 w-3 flex-shrink-0 text-text-3" />
                    <input
                      autoFocus
                      value={pickerQ}
                      onChange={(e) => setPickerQ(e.target.value)}
                      placeholder="Search contacts…"
                      className="min-w-0 flex-1 bg-transparent text-xs text-text-1 placeholder:text-text-3 outline-none"
                    />
                  </div>
                  <ul className="mt-1 max-h-40 overflow-y-auto">
                    {pickerResults
                      .filter((r) => !contacts.some((c) => c.contact_id === r.id))
                      .map((r) => (
                        <li key={r.id}>
                          <button
                            type="button"
                            onClick={() => linkContact(r)}
                            className="flex w-full items-center gap-2 rounded-sm px-1.5 py-1 text-left text-xs text-text-1 hover:bg-bg-2"
                          >
                            <span className="min-w-0 flex-1 truncate">
                              {r.nickname?.trim() ||
                                [r.first_name, r.last_name].filter(Boolean).join(" ").trim() ||
                                r.primary_email ||
                                "Unnamed"}
                            </span>
                          </button>
                        </li>
                      ))}
                    {pickerResults.length === 0 && (
                      <li className="px-1.5 py-1 text-2xs text-text-3">No matches.</li>
                    )}
                  </ul>
                </div>
              )}
            </div>

            {/* Status / delete */}
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
