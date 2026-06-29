/**
 * Client-side typed wrappers around the contacts REST API. Browser-safe (plain
 * fetch); unwraps `{ data }` or throws the server's first error message.
 */
"use client";

import type { ContactRow } from "@/lib/contacts/db";

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => ({}))) as {
    data?: T;
    errors?: { code: string; message: string }[];
  };
  if (!res.ok) {
    throw new Error(json.errors?.[0]?.message ?? `Request failed (${res.status})`);
  }
  return json.data as T;
}

const B = "/api/v1/contacts";

/** The lean row a contacts list/card needs. */
export type ContactListItem = Pick<
  ContactRow,
  | "id"
  | "first_name"
  | "last_name"
  | "nickname"
  | "avatar_url"
  | "contact_types"
  | "tags"
  | "company"
  | "title"
  | "primary_email"
  | "primary_phone"
  | "status"
  | "strength"
  | "user_id"
  | "source"
  | "updated_at"
>;

export interface ContactListParams {
  q?: string;
  type?: string;
  tag?: string;
  status?: "active" | "archived";
  limit?: number;
}

export const listContacts = (params: ContactListParams = {}) => {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.type) sp.set("type", params.type);
  if (params.tag) sp.set("tag", params.tag);
  if (params.status) sp.set("status", params.status);
  if (params.limit) sp.set("limit", String(params.limit));
  const qs = sp.toString();
  return req<{ contacts: ContactListItem[] }>(`${B}${qs ? `?${qs}` : ""}`).then(
    (d) => d.contacts,
  );
};

export const getContact = (id: string) =>
  req<{ contact: ContactRow }>(`${B}/${encodeURIComponent(id)}`).then(
    (d) => d.contact,
  );

export interface DuplicateHit {
  id: string;
  first_name: string;
  last_name: string;
}

export const createContact = (input: Partial<ContactRow>, force = false) =>
  req<{ contact: ContactRow | null; duplicate: DuplicateHit | null }>(
    `${B}${force ? "?force=true" : ""}`,
    { method: "POST", body: JSON.stringify(input) },
  );

export const updateContact = (id: string, patch: Partial<ContactRow>) =>
  req<{ contact: ContactRow }>(`${B}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  }).then((d) => d.contact);

export const archiveContact = (id: string) =>
  req<void>(`${B}/${encodeURIComponent(id)}`, { method: "DELETE" });

export interface LinkSuggestion {
  contact_id: string;
  name: string;
  email: string | null;
}

/** Contacts whose email matches a Rokki account you don't share a space with. */
export const getLinkSuggestions = () =>
  req<{ suggestions: LinkSuggestion[] }>(`${B}/link-suggestions`).then(
    (d) => d.suggestions,
  );

/** Link a contact to the Rokki account its email resolves to (server-side). */
export const linkContact = (id: string) =>
  req<{ contact: ContactRow }>(`${B}/${encodeURIComponent(id)}/link`, {
    method: "POST",
  }).then((d) => d.contact);

/** Remove a contact's Rokki-account link. */
export const unlinkContact = (id: string) =>
  req<{ contact: ContactRow }>(`${B}/${encodeURIComponent(id)}/link`, {
    method: "DELETE",
  }).then((d) => d.contact);

/**
 * Upload a profile picture and get back its public URL. Multipart, so it
 * bypasses the JSON `req` helper. The caller saves the returned URL on the
 * contact's `avatar_url`.
 */
export async function uploadAvatar(file: File): Promise<string> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`${B}/avatar`, { method: "POST", body });
  const json = (await res.json().catch(() => ({}))) as {
    data?: { url: string };
    errors?: { code: string; message: string }[];
  };
  if (!res.ok || !json.data?.url) {
    throw new Error(json.errors?.[0]?.message ?? `Upload failed (${res.status})`);
  }
  return json.data.url;
}
