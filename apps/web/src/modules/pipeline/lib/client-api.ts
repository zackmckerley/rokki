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
