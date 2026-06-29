/**
 * Client-side typed wrappers around the pipeline REST API. Browser-safe (plain
 * fetch); unwraps `{ data }` or throws the server's first error message.
 */
"use client";

import type { PipelineRow, LeadRow } from "@/lib/pipeline/db";

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

const B = "/api/v1/pipeline";

export interface SpaceLite {
  id: string;
  name: string;
  slug: string;
}

export interface Board {
  pipeline: PipelineRow;
  leads: LeadRow[];
}

export const getSpaces = () =>
  req<{ spaces: SpaceLite[] }>(`${B}/spaces`).then((d) => d.spaces);

export const getBoard = (spaceId: string) =>
  req<Board>(`${B}/board?space_id=${encodeURIComponent(spaceId)}`);

export interface LeadInput {
  name?: string;
  subtitle?: string | null;
  stage?: string;
  status?: LeadRow["status"];
  priority?: number;
  source?: string | null;
  next_follow_up_at?: string | null;
  dead_reason?: string | null;
  attributes?: Record<string, unknown>;
}

export const createLead = (input: LeadInput & { pipeline_id: string; space_id: string }) =>
  req<{ lead: LeadRow }>(`${B}/leads`, {
    method: "POST",
    body: JSON.stringify(input),
  }).then((d) => d.lead);

export const getLead = (id: string) =>
  req<{ lead: LeadRow }>(`${B}/leads/${encodeURIComponent(id)}`).then((d) => d.lead);

export const updateLead = (id: string, patch: LeadInput) =>
  req<{ lead: LeadRow }>(`${B}/leads/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  }).then((d) => d.lead);

export const deleteLead = (id: string) =>
  req<void>(`${B}/leads/${encodeURIComponent(id)}`, { method: "DELETE" });

export const updatePipeline = (
  id: string,
  patch: { name?: string; stages?: PipelineRow["stages"]; fields?: PipelineRow["fields"] },
) =>
  req<{ pipeline: PipelineRow }>(`${B}/pipelines/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  }).then((d) => d.pipeline);

export interface LeadContact {
  contact_id: string;
  role: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
}

const leadBase = (id: string) => `${B}/leads/${encodeURIComponent(id)}`;

export const getLeadContacts = (id: string) =>
  req<{ contacts: LeadContact[] }>(`${leadBase(id)}/contacts`).then((d) => d.contacts);

export const addLeadContact = (id: string, contactId: string, role?: string | null) =>
  req<{ contacts: LeadContact[] }>(`${leadBase(id)}/contacts`, {
    method: "POST",
    body: JSON.stringify({ contact_id: contactId, role: role ?? null }),
  }).then((d) => d.contacts);

export const removeLeadContact = (id: string, contactId: string) =>
  req<void>(`${leadBase(id)}/contacts?contact_id=${encodeURIComponent(contactId)}`, {
    method: "DELETE",
  });

export interface PromoteResult {
  terminal: { id: string; ticker: string; name: string };
  lead_id: string;
}

export const promoteLead = (id: string) =>
  req<PromoteResult>(`${leadBase(id)}/promote`, { method: "POST" });

export interface LeadFile {
  key: string;
  name: string;
  size: number;
  type: string;
  uploaded_at: string;
}

export const getLeadFiles = (id: string) =>
  req<{ files: LeadFile[] }>(`${leadBase(id)}/files`).then((d) => d.files);

export async function uploadLeadFile(id: string, file: File): Promise<LeadFile[]> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`${leadBase(id)}/files`, { method: "POST", body });
  const json = (await res.json().catch(() => ({}))) as {
    data?: { files: LeadFile[] };
    errors?: { code: string; message: string }[];
  };
  if (!res.ok || !json.data) {
    throw new Error(json.errors?.[0]?.message ?? `Upload failed (${res.status})`);
  }
  return json.data.files;
}

export const deleteLeadFile = (id: string, key: string) =>
  req<{ files: LeadFile[] }>(
    `${leadBase(id)}/files?key=${encodeURIComponent(key)}`,
    { method: "DELETE" },
  ).then((d) => d.files);

/** Get a short-lived signed download URL for an attachment. */
export const signLeadFile = (id: string, key: string) =>
  req<{ url: string }>(
    `${leadBase(id)}/files/sign?key=${encodeURIComponent(key)}`,
  ).then((d) => d.url);
