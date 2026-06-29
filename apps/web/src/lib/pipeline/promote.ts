/**
 * Lead ↔ contact links + promote-to-Terminal (the "going hard" gate).
 *
 * Promote creates a Terminal in the lead's space, carries the lead's linked
 * Contacts onto the Terminal (terminal_contacts), and marks the lead converted.
 * All writes go through the caller's RLS-scoped client: terminal creation is
 * allowed for any space member (the trg_terminal_init_members trigger seeds the
 * creator as a terminal owner, which then authorizes the terminal_contacts
 * copy); only the caller's own contacts (RLS) are carried over.
 */
import { pipelineDb } from "./db";
import { suggestTicker, uniqueTicker, isValidTicker } from "@/lib/ticker";

/**
 * A valid, space-unique terminal ticker for a lead. Lead names are often
 * numeric addresses ("2510 SW 16 St"), and suggestTicker can return a
 * digit-leading string that violates the terminals ticker CHECK — so force a
 * letter lead and fall back to DEAL before deduping.
 */
export function dealTicker(name: string, taken: string[]): string {
  let base = suggestTicker(name).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (!/^[A-Z]/.test(base)) base = `D${base}`;
  base = base.slice(0, 10);
  if (!isValidTicker(base)) base = "DEAL";
  return uniqueTicker(base, taken);
}

export interface LeadContact {
  contact_id: string;
  role: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
}

interface ContactEmbed {
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  primary_email: string | null;
  primary_phone: string | null;
  company: string | null;
}

export async function listLeadContacts(
  client: unknown,
  leadId: string,
): Promise<LeadContact[]> {
  const { data, error } = await pipelineDb(client)
    .from("pl_lead_contacts")
    .select(
      "contact_id, role, contacts:contact_id(first_name, last_name, nickname, primary_email, primary_phone, company)",
    )
    .eq("lead_id", leadId);
  if (error) throw new Error(error.message);
  type Row = { contact_id: string; role: string | null; contacts: ContactEmbed | null };
  return ((data ?? []) as Row[]).map((r) => {
    const c = r.contacts;
    const name =
      c?.nickname?.trim() ||
      [c?.first_name, c?.last_name].filter(Boolean).join(" ").trim() ||
      c?.primary_email ||
      "Contact";
    return {
      contact_id: r.contact_id,
      role: r.role,
      name,
      email: c?.primary_email ?? null,
      phone: c?.primary_phone ?? null,
      company: c?.company ?? null,
    };
  });
}

export async function addLeadContact(
  client: unknown,
  leadId: string,
  contactId: string,
  role: string | null,
): Promise<void> {
  const { error } = await pipelineDb(client)
    .from("pl_lead_contacts")
    .upsert(
      { lead_id: leadId, contact_id: contactId, role: role ?? null },
      { onConflict: "lead_id,contact_id" },
    );
  if (error) throw new Error(error.message);
}

export async function removeLeadContact(
  client: unknown,
  leadId: string,
  contactId: string,
): Promise<void> {
  const { error } = await pipelineDb(client)
    .from("pl_lead_contacts")
    .delete()
    .eq("lead_id", leadId)
    .eq("contact_id", contactId);
  if (error) throw new Error(error.message);
}

export interface PromoteResult {
  terminal: { id: string; ticker: string; name: string };
  lead_id: string;
}

/**
 * Promote a lead to a Terminal via the atomic `promote_lead_to_terminal` RPC:
 * the terminal create + contact carry-over + lead conversion happen in one
 * transaction (no orphan terminal on partial failure; a FOR UPDATE lock blocks
 * a double-promote race; ALL linked contacts carry over, even co-members').
 * The app generates the (valid, space-unique) ticker and passes it in.
 */
export async function promoteLead(
  client: unknown,
  leadId: string,
): Promise<PromoteResult> {
  const db = pipelineDb(client);

  const { data: leadData, error: leadErr } = await db
    .from("pl_leads")
    .select("space_id, name, promoted_terminal_id")
    .eq("id", leadId)
    .maybeSingle();
  if (leadErr) throw new Error(leadErr.message);
  const lead = leadData as
    | { space_id: string; name: string; promoted_terminal_id: string | null }
    | null;
  if (!lead) throw new Error("Lead not found");
  if (lead.promoted_terminal_id) throw new Error("This lead is already a terminal");

  const { data: taken } = await db
    .from("terminals")
    .select("ticker")
    .eq("space_id", lead.space_id);
  const ticker = dealTicker(
    lead.name,
    ((taken ?? []) as { ticker: string }[]).map((t) => t.ticker),
  );

  const { data, error } = await db.rpc("promote_lead_to_terminal", {
    p_lead_id: leadId,
    p_ticker: ticker,
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as {
    terminal_id: string;
    out_ticker: string;
    out_name: string;
  }[];
  if (rows.length === 0) throw new Error("Promote failed");
  const r = rows[0];
  return {
    terminal: { id: r.terminal_id, ticker: r.out_ticker, name: r.out_name },
    lead_id: leadId,
  };
}
