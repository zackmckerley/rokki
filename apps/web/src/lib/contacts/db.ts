/**
 * Typed Row interfaces for the contacts tables + a loosely-typed client accessor.
 *
 * The generated `@rokki/db` types don't yet include `contacts`/`interactions` —
 * they're picked up when `supabase gen types` is re-run after
 * `20260628120000_contacts_init.sql`. Until then we follow the repo's established
 * Supabase-client-boundary convention (see `lib/markets/db.ts`,
 * `lib/resolve-terminal.ts`): `contactsDb()` returns a loosely-typed client so
 * `.from("contacts")` resolves, and query RESULTS are cast back to the Row
 * interfaces below at each call site. Delete `contactsDb` and switch to the
 * generated types once they include these tables.
 */

export interface ContactEmail {
  email: string;
  label?: string;
  primary?: boolean;
}
export interface ContactPhone {
  phone: string;
  label?: string;
  primary?: boolean;
}
export interface ContactAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal?: string;
  country?: string;
  label?: string;
}
export interface ContactSocial {
  kind: string; // linkedin|instagram|x|facebook|website|...
  value: string;
}
export interface ContactFamilyMember {
  name: string;
  relation?: string; // spouse|child|parent|sibling|partner|assistant|...
}

export interface ContactRow {
  id: string;
  owner_id: string;
  /** Linked Rokki user, for synced team-member contacts. */
  user_id: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  prefix: string | null;
  suffix: string | null;
  nickname: string | null;
  avatar_url: string | null;
  contact_types: string[];
  tags: string[];
  title: string | null;
  company: string | null;
  license_no: string | null;
  birthday: string | null;
  strength: number;
  source: string | null;
  status: "active" | "archived";
  do_not_contact: boolean;
  notes: string | null;
  emails: ContactEmail[];
  phones: ContactPhone[];
  addresses: ContactAddress[];
  socials: ContactSocial[];
  family: ContactFamilyMember[];
  primary_email: string | null;
  primary_phone: string | null;
  custom: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type InteractionType =
  | "note"
  | "call"
  | "email"
  | "meeting"
  | "text"
  | "site_visit"
  | "offer"
  | "stage_change"
  | "follow_up";

export interface InteractionRow {
  id: string;
  owner_id: string;
  space_id: string | null;
  contact_id: string | null;
  lead_id: string | null;
  terminal_id: string | null;
  type: InteractionType;
  body: string;
  occurred_at: string;
  /** Set (with done_at null) ⇒ this is an open follow-up reminder. */
  due_at: string | null;
  done_at: string | null;
  created_by: string;
  created_at: string;
}

/** Columns a contact card needs in a list (keeps payloads lean). */
export const CONTACT_LIST_COLUMNS =
  "id, first_name, last_name, nickname, avatar_url, contact_types, tags, company, " +
  "title, primary_email, primary_phone, status, strength, user_id, updated_at";

/**
 * Loosely-typed Supabase client for the contacts tables. Same `any`-boundary
 * convention as `marketsDb()`; remove once the generated types include the
 * `contacts`/`interactions` tables.
 */
export type ContactsClient = any;

export function contactsDb(client: unknown): ContactsClient {
  return client as ContactsClient;
}
