"use client";

import { useEffect, useState, useRef } from "react";
import {
  X,
  Loader2,
  Trash2,
  Ban,
  RotateCcw,
  ArrowUpRight,
  Plus,
  Search,
  Paperclip,
  Download,
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
  getLeadFiles,
  uploadLeadFile,
  deleteLeadFile,
  signLeadFile,
  type LeadInput,
  type LeadContact,
  type LeadFile,
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

  const [files, setFiles] = useState<LeadFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      getLead(leadId),
      getLeadContacts(leadId).catch(() => []),
      getLeadFiles(leadId).catch(() => []),
    ])
      .then(([l, cs, fs]) => {
        if (!alive) return;
        setLead(l);
        setContacts(cs);
        setFiles(fs);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Failed"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [leadId]);

  async function uploadFile(file: File | undefined | null) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      setFiles(await uploadLeadFile(leadId, file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }
  async function removeFile(key: string) {
    try {
      setFiles(await deleteLeadFile(leadId, key));
    } catch {
      /* non-fatal */
    }
  }
  async function openFile(key: string) {
    try {
      const url = await signLeadFile(leadId, key);
      window.open(url, "_blank", "noopener");
    } catch {
      /* non-fatal */
    }
  }
  function fmtSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

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

            {/* Files */}
            <div
              className="flex flex-col gap-1.5 border-t border-border/40 pt-2"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void uploadFile(e.dataTransfer.files?.[0]);
              }}
            >
              <div className="flex items-center gap-2">
                <span className={sectionLabel}>Files</span>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="ml-auto flex items-center gap-0.5 text-2xs text-text-3 hover:text-text-1"
                >
                  {uploading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Plus className="h-3 w-3" />
                  )}
                  Upload
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => void uploadFile(e.target.files?.[0])}
                />
              </div>
              {files.length === 0 ? (
                <p className="text-2xs text-text-3">
                  No files. Drag one here, or use Upload.
                </p>
              ) : (
                files.map((f) => (
                  <div key={f.key} className="flex items-center gap-2 text-xs text-text-1">
                    <Paperclip className="h-3 w-3 flex-shrink-0 text-text-3" />
                    <button
                      type="button"
                      onClick={() => openFile(f.key)}
                      className="min-w-0 flex-1 truncate text-left hover:text-text-0"
                      title={f.name}
                    >
                      {f.name}
                    </button>
                    <span className="flex-shrink-0 text-[9px] text-text-3">{fmtSize(f.size)}</span>
                    <button
                      type="button"
                      onClick={() => openFile(f.key)}
                      aria-label="Download"
                      className="rounded-sm p-0.5 text-text-3 hover:text-text-0"
                    >
                      <Download className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFile(f.key)}
                      aria-label="Remove file"
                      className="rounded-sm p-0.5 text-text-3 hover:text-danger"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))
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
