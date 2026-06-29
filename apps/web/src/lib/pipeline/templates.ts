/**
 * Pipeline templates — starting points a pipeline creator picks then edits.
 * Stages + a field schema per deal-kind. `Dead` is a status (settable from any
 * stage), not a column, so it never appears here.
 */
import type { PipelineStage, PipelineField } from "./db";

export interface PipelineTemplate {
  kind: string;
  name: string;
  stages: PipelineStage[];
  fields: PipelineField[];
}

const RE_FIELDS: PipelineField[] = [
  // Location — the filterable fields (City / Submarket drive the list view).
  { key: "address", label: "Street address", type: "text", group: "Location" },
  { key: "city", label: "City", type: "text", group: "Location" },
  { key: "submarket", label: "Submarket / Neighborhood", type: "text", group: "Location" },
  {
    key: "county",
    label: "County",
    type: "select",
    options: ["Miami-Dade", "Broward", "Palm Beach", "Other"],
    group: "Location",
  },
  { key: "zip", label: "ZIP", type: "text", group: "Location" },
  { key: "folio", label: "Folio / APN", type: "text", group: "Location" },
  // Property & terms — kept from the original template, collapsed by default.
  { key: "parcel_size", label: "Parcel size", type: "text", group: "Property & terms" },
  { key: "zoning", label: "Zoning", type: "text", group: "Property & terms" },
  { key: "land_use", label: "Land use", type: "text", group: "Property & terms" },
  { key: "product_type", label: "Product type", type: "text", group: "Property & terms" },
  { key: "asking", label: "Asking", type: "currency", group: "Property & terms" },
  { key: "owner", label: "Owner of record", type: "text", group: "Property & terms" },
  // Links.
  { key: "listing_url", label: "Listing URL", type: "url", group: "Links" },
  { key: "county_url", label: "County record URL", type: "url", group: "Links" },
  { key: "maps_url", label: "Google Maps", type: "url", group: "Links" },
];

/** Zack's HELIOS deal flow (the default for a real-estate pipeline). */
export const HELIOS_PIPELINE: PipelineTemplate = {
  kind: "real_estate",
  name: "HELIOS Pipeline",
  stages: [
    { key: "tracking", label: "Tracking", type: "open", rotting_days: 30 },
    { key: "engaging", label: "Engaging", type: "open", rotting_days: 14 },
    { key: "due_diligence", label: "Due Diligence", type: "open", rotting_days: 14 },
    { key: "offer", label: "Offer", type: "open", rotting_days: 7 },
    {
      key: "under_contract",
      label: "Under Contract",
      type: "open",
      rotting_days: 14,
      is_terminal_gate: true,
    },
    { key: "active_project", label: "Active Project", type: "open" },
    { key: "closed", label: "Closed", type: "won" },
  ],
  fields: RE_FIELDS,
};

export const BUSINESS_PIPELINE: PipelineTemplate = {
  kind: "business",
  name: "Business Acquisition",
  stages: [
    { key: "sourced", label: "Sourced", type: "open", rotting_days: 30 },
    { key: "nda", label: "NDA", type: "open", rotting_days: 14 },
    { key: "reviewing", label: "Reviewing CIM", type: "open", rotting_days: 14 },
    { key: "ioi", label: "IOI", type: "open", rotting_days: 10 },
    { key: "loi", label: "LOI", type: "open", rotting_days: 7, is_terminal_gate: true },
    { key: "diligence", label: "Diligence", type: "open" },
    { key: "closed", label: "Closed", type: "won" },
  ],
  fields: [
    { key: "company", label: "Company", type: "text" },
    { key: "sector", label: "Sector", type: "text" },
    { key: "revenue", label: "Revenue", type: "currency" },
    { key: "ebitda", label: "EBITDA / SDE", type: "currency" },
    { key: "asking", label: "Asking", type: "currency" },
    { key: "multiple", label: "Multiple", type: "number" },
    { key: "seller", label: "Seller", type: "text" },
  ],
};

export const GENERIC_PIPELINE: PipelineTemplate = {
  kind: "generic",
  name: "Pipeline",
  stages: [
    { key: "lead", label: "Lead", type: "open", rotting_days: 30 },
    { key: "qualified", label: "Qualified", type: "open", rotting_days: 14 },
    { key: "engaged", label: "Engaged", type: "open", rotting_days: 10, is_terminal_gate: true },
    { key: "negotiating", label: "Negotiating", type: "open" },
    { key: "won", label: "Won", type: "won" },
  ],
  fields: [{ key: "value", label: "Value", type: "currency" }],
};

export const PIPELINE_TEMPLATES: PipelineTemplate[] = [
  HELIOS_PIPELINE,
  BUSINESS_PIPELINE,
  GENERIC_PIPELINE,
];

/** The default a new space's pipeline is seeded with on first use. */
export const DEFAULT_PIPELINE = HELIOS_PIPELINE;

/** The stage flagged as the promote-to-Terminal gate, if any. */
export function terminalGateStage(stages: PipelineStage[]): PipelineStage | null {
  return stages.find((s) => s.is_terminal_gate) ?? null;
}
