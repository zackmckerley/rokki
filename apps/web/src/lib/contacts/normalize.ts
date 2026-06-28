/**
 * Pure contact-field normalization — deriving the denormalized primary
 * email/phone from the multi-value arrays, plus display name + dedupe keys.
 * No I/O, so it's unit-tested and reused by both the API and the client.
 */
import type { ContactEmail, ContactPhone } from "./db";

/** Lower-case + trim an email for comparison/storage. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Reduce a phone to a comparable form (keep digits + a leading +). */
export function normalizePhone(phone: string): string {
  const p = phone.trim();
  const plus = p.startsWith("+") ? "+" : "";
  return plus + p.replace(/\D/g, "");
}

/** The primary email: the one flagged `primary`, else the first, else null. */
export function primaryEmail(emails: ContactEmail[] | undefined): string | null {
  if (!Array.isArray(emails) || emails.length === 0) return null;
  const chosen =
    emails.find((e) => e?.primary && e?.email) ?? emails.find((e) => e?.email);
  return chosen?.email ? normalizeEmail(chosen.email) : null;
}

/** The primary phone: the one flagged `primary`, else the first, else null. */
export function primaryPhone(phones: ContactPhone[] | undefined): string | null {
  if (!Array.isArray(phones) || phones.length === 0) return null;
  const chosen =
    phones.find((p) => p?.primary && p?.phone) ?? phones.find((p) => p?.phone);
  return chosen?.phone ? normalizePhone(chosen.phone) : null;
}

/** Human display name (nickname wins; falls back to first+last, then email). */
export function displayName(c: {
  first_name?: string | null;
  last_name?: string | null;
  nickname?: string | null;
  primary_email?: string | null;
}): string {
  const full = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return (c.nickname?.trim() || full || c.primary_email || "Unnamed").trim();
}

/** Whether a contact has at least one name character (mirrors the DB CHECK). */
export function hasName(c: {
  first_name?: string | null;
  last_name?: string | null;
  nickname?: string | null;
}): boolean {
  return (
    ((c.first_name ?? "") + (c.last_name ?? "") + (c.nickname ?? "")).trim()
      .length > 0
  );
}
