/**
 * Server-side data access for contacts. Thin functions over the Supabase
 * client (RLS does the authorization); the HTTP routes stay declarative.
 * Owner scoping is also applied here defensively (belt + braces with RLS).
 */
import {
  contactsDb,
  CONTACT_LIST_COLUMNS,
  type ContactRow,
  type ContactEmail,
  type ContactPhone,
  type ContactAddress,
  type ContactSocial,
} from "./db";
import { primaryEmail, primaryPhone, hasName } from "./normalize";

export interface ContactInput {
  first_name?: string;
  middle_name?: string | null;
  last_name?: string;
  prefix?: string | null;
  suffix?: string | null;
  nickname?: string | null;
  avatar_url?: string | null;
  contact_types?: string[];
  tags?: string[];
  title?: string | null;
  firm?: string | null;
  license_no?: string | null;
  strength?: number;
  source?: string | null;
  status?: "active" | "archived";
  do_not_contact?: boolean;
  notes?: string | null;
  emails?: ContactEmail[];
  phones?: ContactPhone[];
  addresses?: ContactAddress[];
  socials?: ContactSocial[];
  custom?: Record<string, unknown>;
  user_id?: string | null;
}

const WRITABLE: (keyof ContactInput)[] = [
  "first_name", "middle_name", "last_name", "prefix", "suffix", "nickname",
  "avatar_url", "contact_types", "tags", "title", "firm", "license_no",
  "strength", "source", "status", "do_not_contact", "notes", "emails",
  "phones", "addresses", "socials", "custom", "user_id",
];

/** Strip everything except the writable fields (never trust client owner_id/id). */
function pickWritable(input: ContactInput): Partial<ContactRow> {
  const out: Record<string, unknown> = {};
  for (const k of WRITABLE) {
    if (input[k] !== undefined) out[k] = input[k];
  }
  return out as Partial<ContactRow>;
}

/** Recompute denormalized primary email/phone from whatever arrays are present. */
function withDerivedKeys(
  patch: Partial<ContactRow>,
  input: ContactInput,
): Partial<ContactRow> {
  const next = { ...patch };
  if (input.emails !== undefined) next.primary_email = primaryEmail(input.emails);
  if (input.phones !== undefined) next.primary_phone = primaryPhone(input.phones);
  return next;
}

export interface ListOpts {
  q?: string;
  type?: string;
  tag?: string;
  status?: "active" | "archived";
  limit?: number;
}

export async function listContacts(
  client: unknown,
  ownerId: string,
  opts: ListOpts = {},
): Promise<Partial<ContactRow>[]> {
  const db = contactsDb(client);
  let query = db
    .from("contacts")
    .select(CONTACT_LIST_COLUMNS)
    .eq("owner_id", ownerId)
    .eq("status", opts.status ?? "active");
  if (opts.type) query = query.contains("contact_types", [opts.type]);
  if (opts.tag) query = query.contains("tags", [opts.tag]);
  if (opts.q) {
    // Strip chars that would break PostgREST's or()/ilike filter syntax.
    const q = opts.q.replace(/[%,()*]/g, "").trim();
    if (q) {
      query = query.or(
        [
          `first_name.ilike.%${q}%`,
          `last_name.ilike.%${q}%`,
          `nickname.ilike.%${q}%`,
          `firm.ilike.%${q}%`,
          `primary_email.ilike.%${q}%`,
          `primary_phone.ilike.%${q}%`,
        ].join(","),
      );
    }
  }
  const { data, error } = await query
    .order("updated_at", { ascending: false })
    .limit(Math.min(opts.limit ?? 100, 500));
  if (error) throw new Error(error.message);
  return (data ?? []) as Partial<ContactRow>[];
}

export async function getContact(
  client: unknown,
  ownerId: string,
  id: string,
): Promise<ContactRow | null> {
  const { data, error } = await contactsDb(client)
    .from("contacts")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as ContactRow | null;
}

export interface DuplicateHit {
  id: string;
  first_name: string;
  last_name: string;
}

/** Find an existing contact for this owner matching the email or phone. */
export async function findDuplicate(
  client: unknown,
  ownerId: string,
  email: string | null,
  phone: string | null,
): Promise<DuplicateHit | null> {
  if (!email && !phone) return null;
  const ors: string[] = [];
  if (email) ors.push(`primary_email.eq.${email}`);
  if (phone) ors.push(`primary_phone.eq.${phone}`);
  const { data } = await contactsDb(client)
    .from("contacts")
    .select("id, first_name, last_name")
    .eq("owner_id", ownerId)
    .eq("status", "active")
    .or(ors.join(","))
    .limit(1);
  return ((data ?? [])[0] ?? null) as DuplicateHit | null;
}

export async function createContact(
  client: unknown,
  ownerId: string,
  input: ContactInput,
): Promise<ContactRow> {
  if (!hasName(input)) throw new Error("A contact needs a name");
  const row = {
    owner_id: ownerId,
    ...withDerivedKeys(pickWritable(input), input),
  };
  const { data, error } = await contactsDb(client)
    .from("contacts")
    .insert(row)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as ContactRow;
}

export async function updateContact(
  client: unknown,
  ownerId: string,
  id: string,
  input: ContactInput,
): Promise<ContactRow | null> {
  const patch = withDerivedKeys(pickWritable(input), input);
  if (Object.keys(patch).length === 0) return getContact(client, ownerId, id);
  const { data, error } = await contactsDb(client)
    .from("contacts")
    .update(patch)
    .eq("owner_id", ownerId)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as ContactRow | null;
}

/** Soft-archive (status='archived'); keeps history + links intact. */
export async function archiveContact(
  client: unknown,
  ownerId: string,
  id: string,
): Promise<void> {
  const { error } = await contactsDb(client)
    .from("contacts")
    .update({ status: "archived" })
    .eq("owner_id", ownerId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}
