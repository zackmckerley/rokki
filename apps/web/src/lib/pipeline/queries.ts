/**
 * Server-side data access for the pipeline module. Thin over the Supabase
 * client — RLS does the authorization (pipelines + leads are space-scoped);
 * these assemble the board and apply the writable whitelists.
 */
import { pipelineDb, type PipelineRow, type LeadRow } from "./db";
import { DEFAULT_PIPELINE, PIPELINE_TEMPLATES } from "./templates";
import { defaultStageKey } from "./board";

export interface SpaceLite {
  id: string;
  name: string;
  slug: string;
}

/** The spaces the caller is a member of (RLS-scoped), for the board's picker. */
export async function listSpacesForUser(client: unknown): Promise<SpaceLite[]> {
  const { data, error } = await pipelineDb(client)
    .from("spaces")
    .select("id, name, slug")
    .is("archived_at", null)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as SpaceLite[];
}

/**
 * The space's pipeline, creating the default (HELIOS) one on first use. One
 * pipeline per space for now; the schema allows more, picked by position.
 */
export async function ensurePipelineForSpace(
  client: unknown,
  spaceId: string,
  userId: string,
): Promise<PipelineRow> {
  const db = pipelineDb(client);
  const { data, error } = await db
    .from("pl_pipelines")
    .select("*")
    .eq("space_id", spaceId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as PipelineRow[];
  if (rows.length) {
    const existing = rows[0];
    // Until a field editor exists, keep a template-backed pipeline's fields in
    // sync with its template — so new fields (City/Submarket/Links) appear on an
    // already-created pipeline. No user field edits to preserve yet.
    const tmpl = PIPELINE_TEMPLATES.find((t) => t.kind === existing.kind);
    if (tmpl && JSON.stringify(existing.fields) !== JSON.stringify(tmpl.fields)) {
      const { data: upd } = await db
        .from("pl_pipelines")
        .update({ fields: tmpl.fields })
        .eq("id", existing.id)
        .select("*")
        .maybeSingle();
      if (upd) return upd as PipelineRow;
    }
    return existing;
  }

  const { data: created, error: insErr } = await db
    .from("pl_pipelines")
    .insert({
      space_id: spaceId,
      name: DEFAULT_PIPELINE.name,
      kind: DEFAULT_PIPELINE.kind,
      stages: DEFAULT_PIPELINE.stages,
      fields: DEFAULT_PIPELINE.fields,
      created_by: userId,
    })
    .select("*")
    .single();
  if (insErr) throw new Error(insErr.message);
  return created as PipelineRow;
}

export async function getPipeline(
  client: unknown,
  id: string,
): Promise<PipelineRow | null> {
  const { data, error } = await pipelineDb(client)
    .from("pl_pipelines")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as PipelineRow | null;
}

export interface PipelinePatch {
  name?: string;
  stages?: PipelineRow["stages"];
  fields?: PipelineRow["fields"];
}

export async function updatePipeline(
  client: unknown,
  id: string,
  patch: PipelinePatch,
): Promise<PipelineRow | null> {
  const writable: Record<string, unknown> = {};
  if (patch.name !== undefined) writable.name = patch.name;
  if (patch.stages !== undefined) writable.stages = patch.stages;
  if (patch.fields !== undefined) writable.fields = patch.fields;
  if (Object.keys(writable).length === 0) return getPipeline(client, id);
  const { data, error } = await pipelineDb(client)
    .from("pl_pipelines")
    .update(writable)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as PipelineRow | null;
}

/** All leads on a pipeline (lightweight; the board groups them client-side). */
export async function listLeads(
  client: unknown,
  pipelineId: string,
): Promise<LeadRow[]> {
  const { data, error } = await pipelineDb(client)
    .from("pl_leads")
    .select("*")
    .eq("pipeline_id", pipelineId)
    .order("priority", { ascending: false })
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as LeadRow[];
}

export async function getLead(
  client: unknown,
  id: string,
): Promise<LeadRow | null> {
  const { data, error } = await pipelineDb(client)
    .from("pl_leads")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as LeadRow | null;
}

export interface LeadInput {
  name?: string;
  subtitle?: string | null;
  stage?: string;
  status?: LeadRow["status"];
  priority?: number;
  source?: string | null;
  next_follow_up_at?: string | null;
  dead_reason?: string | null;
  lat?: number | null;
  lng?: number | null;
  attributes?: Record<string, unknown>;
}

const LEAD_WRITABLE: (keyof LeadInput)[] = [
  "name", "subtitle", "stage", "status", "priority", "source",
  "next_follow_up_at", "dead_reason", "lat", "lng", "attributes",
];

function pickLead(input: LeadInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of LEAD_WRITABLE) if (input[k] !== undefined) out[k] = input[k];
  return out;
}

export async function createLead(
  client: unknown,
  args: { pipeline_id: string; space_id: string; defaultStage: string },
  input: LeadInput,
  userId: string,
): Promise<LeadRow> {
  if (!input.name || !input.name.trim()) throw new Error("A lead needs a name");
  const row = {
    pipeline_id: args.pipeline_id,
    space_id: args.space_id,
    owner_id: userId,
    created_by: userId,
    ...pickLead(input),
    stage: input.stage?.trim() || args.defaultStage,
  };
  const { data, error } = await pipelineDb(client)
    .from("pl_leads")
    .insert(row)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as LeadRow;
}

export async function updateLead(
  client: unknown,
  id: string,
  input: LeadInput,
): Promise<LeadRow | null> {
  const patch = pickLead(input);
  if (Object.keys(patch).length === 0) return getLead(client, id);
  // Moving stages (or any explicit touch) counts as activity → un-rot the lead.
  if (input.stage !== undefined || input.status !== undefined) {
    patch.last_activity_at = new Date().toISOString();
  }
  const { data, error } = await pipelineDb(client)
    .from("pl_leads")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as LeadRow | null;
}

/** Hard-delete a lead (they're lightweight; "Dead" is a status, delete is a
 *  true remove). RLS limits it to the owning space's members. */
export async function deleteLead(client: unknown, id: string): Promise<void> {
  const { error } = await pipelineDb(client).from("pl_leads").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export { defaultStageKey };
