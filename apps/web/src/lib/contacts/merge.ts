/**
 * Pure merge helpers for folding a parsed contact blob (see `parse.ts`) into an
 * in-progress contact form. Extracted from the form component so the dedupe /
 * clobber rules are unit-tested. Rules:
 *   - multi-value rows (emails/phones/addresses/socials) are APPENDED + DEDUPED
 *     against what's already there; never reordered or dropped.
 *   - returned objects are always fresh (no shared references with the parser's
 *     output), so later form edits can't corrupt the parsed source and React
 *     always sees new array + element identities.
 */
import type { ContactAddress, ContactSocial } from "./db";
import type { ParsedContact } from "./parse";
import { phoneDedupeKey } from "./normalize";

export interface EmailRow {
  label: string;
  email: string;
  primary?: boolean;
}
export interface PhoneRow {
  label: string;
  phone: string;
  primary?: boolean;
}

/** Append parsed emails to the existing rows, dropping empty placeholders + dups. */
export function mergeEmails(
  existing: EmailRow[],
  incoming: ParsedContact["emails"],
): EmailRow[] {
  const real = existing.filter((e) => e.email.trim());
  const seen = new Set(real.map((e) => e.email.trim().toLowerCase()));
  for (const e of incoming) {
    const key = e.email.trim().toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      real.push({ label: e.label ?? "", email: e.email });
    }
  }
  return real.length ? real : [{ label: "", email: "" }];
}

/** Append parsed phones, deduping on the format-insensitive phone key. */
export function mergePhones(
  existing: PhoneRow[],
  incoming: ParsedContact["phones"],
): PhoneRow[] {
  const real = existing.filter((p) => p.phone.trim());
  const seen = new Set(real.map((p) => phoneDedupeKey(p.phone)));
  for (const p of incoming) {
    const key = phoneDedupeKey(p.phone);
    if (key && !seen.has(key)) {
      seen.add(key);
      real.push({ label: p.label ?? "", phone: p.phone });
    }
  }
  return real.length ? real : [{ label: "", phone: "" }];
}

/** Dedupe key across ALL address parts (line2/country included so they aren't lost). */
export function addrKey(a: ContactAddress): string {
  return [a.line1, a.line2, a.city, a.state, a.postal, a.country]
    .map((s) => (s ?? "").trim().toLowerCase())
    .join("|");
}

export function mergeAddresses(
  existing: ContactAddress[],
  incoming: ContactAddress[],
): ContactAddress[] {
  const seen = new Set(existing.map(addrKey));
  const out = existing.map((a) => ({ ...a }));
  for (const a of incoming) {
    const key = addrKey(a);
    // Skip only genuinely empty addresses (every part blank → all separators).
    if (key.replace(/\|/g, "") !== "" && !seen.has(key)) {
      seen.add(key);
      out.push({ ...a });
    }
  }
  return out;
}

export function mergeSocials(
  existing: ContactSocial[],
  incoming: ContactSocial[],
): ContactSocial[] {
  const seen = new Set(existing.map((s) => s.value.trim().toLowerCase()));
  const out = existing.map((s) => ({ ...s }));
  for (const s of incoming) {
    const key = s.value.trim().toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push({ ...s });
    }
  }
  return out;
}

/** Human summary of what a parse filled, e.g. "name · 2 emails · 1 phone". */
export function parseSummary(p: ParsedContact): string {
  const bits: string[] = [];
  if (p.first_name || p.last_name) bits.push("name");
  if (p.company) bits.push("company");
  if (p.title) bits.push("title");
  if (p.emails.length) bits.push(`${p.emails.length} email${p.emails.length > 1 ? "s" : ""}`);
  if (p.phones.length) bits.push(`${p.phones.length} phone${p.phones.length > 1 ? "s" : ""}`);
  if (p.addresses.length)
    bits.push(`${p.addresses.length} address${p.addresses.length > 1 ? "es" : ""}`);
  if (p.socials.length) bits.push(`${p.socials.length} link${p.socials.length > 1 ? "s" : ""}`);
  if (p.birthday) bits.push("birthday");
  return bits.join(" · ");
}
