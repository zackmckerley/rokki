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
import { suggestTicker, uniqueTicker } from "@/lib/ticker";

export interface LeadContact {
  contact_id: string;
  role: string | null;
  name: string;
  email: string | null;
}

interface ContactEmbed {
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  primary_email: string | null;
}

export async function listLeadContacts(
  client: unknown,
  leadId: string,
): Promise<LeadContact[]> {
  const { data, error } = await pipelineDb(client)
    .from("pl_lead_contacts")
    .select(
      "contact_id, role, contacts:contact_id(first_name, last_name, nickname, primary_email)",
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
    return { contact_id: r.contact_id, role: r.role, name, email: c?.primary_email ?? null };
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
 * Promote a lead to a Terminal. Idempotency: refuses if the lead is already
 * promoted (promoted_terminal_id set). Sequential writes (no DB transaction) —
 * mirrors the projects-create path; the early already-promoted guard keeps a
 * retry from creating a second terminal in the common case.
 */
export async function promoteLead(
  client: unknown,
  leadId: string,
  userId: string,
): Promise<PromoteResult> {
  const db = pipelineDb(client);

  const { data: leadData, error: leadErr } = await db
    .from("pl_leads")
    .select("id, space_id, name, promoted_terminal_id")
    .eq("id", leadId)
    .maybeSingle();
  if (leadErr) throw new Error(leadErr.message);
  const lead = leadData as
    | { id: string; space_id: string; name: string; promoted_terminal_id: string | null }
    | null;
  if (!lead) throw new Error("Lead not found");
  if (lead.promoted_terminal_id) throw new Error("This lead is already a terminal");

  const { data: taken } = await db
    .from("terminals")
    .select("ticker")
    .eq("space_id", lead.space_id);
  const takenTickers = ((taken ?? []) as { ticker: string }[]).map((t) => t.ticker);
  const ticker = uniqueTicker(suggestTicker(lead.name), takenTickers);

  const { data: termData, error: termErr } = await db
    .from("terminals")
    .insert({
      space_id: lead.space_id,
      ticker,
      name: lead.name,
      type: "deal",
      status: "active",
      created_by: userId,
    })
    .select("id, ticker, name")
    .single();
  if (termErr) throw new Error(termErr.message);
  const terminal = termData as { id: string; ticker: string; name: string };

  // Carry the lead's contacts onto the terminal.
  const { data: lcs } = await db
    .from("pl_lead_contacts")
    .select("contact_id, role")
    .eq("lead_id", leadId);
  const links = ((lcs ?? []) as { contact_id: string; role: string | null }[]).map((c) => ({
    terminal_id: terminal.id,
    contact_id: c.contact_id,
    role: c.role,
  }));
  if (links.length > 0) {
    const { error: tcErr } = await db
      .from("terminal_contacts")
      .upsert(links, { onConflict: "terminal_id,contact_id" });
    if (tcErr) throw new Error(tcErr.message);
  }

  const { error: updErr } = await db
    .from("pl_leads")
    .update({ promoted_terminal_id: terminal.id, status: "converted" })
    .eq("id", leadId);
  if (updErr) throw new Error(updErr.message);

  return { terminal, lead_id: leadId };
}
