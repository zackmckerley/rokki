import fs from "node:fs/promises";
import path from "node:path";

/**
 * `rokki publish` reads a JSON manifest shaped like:
 *
 *   {
 *     "name": "Aerial reels",
 *     "slug": "aerial-reels",
 *     "description": "Generate drone reels for a property address.",
 *     "timeout_seconds": 20,
 *     "tags": ["drone", "real-estate"],
 *     "input_schema": { "type": "object", ... },
 *     "output_schema": { ... },
 *     "code_file": "./src/index.js"         // path relative to the manifest
 *   }
 *
 * `code_file` is read off disk so the manifest itself stays small.
 */

export interface ToolManifest {
  name: string;
  slug?: string;
  description: string;
  timeout_seconds?: number;
  tags?: string[];
  input_schema?: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  code: string;
}

export async function readToolManifest(manifestPath: string): Promise<ToolManifest> {
  const raw = await fs.readFile(manifestPath, "utf-8");
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `manifest is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const name = requireString(parsed, "name");
  const description = requireString(parsed, "description");
  if (description.length < 10) {
    throw new Error("description must be ≥ 10 characters");
  }

  const codeFile = parsed.code_file;
  if (typeof codeFile !== "string") {
    throw new Error("manifest needs a `code_file` pointing at the tool's entry JS");
  }
  const resolved = path.resolve(path.dirname(manifestPath), codeFile);
  const code = await fs.readFile(resolved, "utf-8");

  return {
    name,
    slug: typeof parsed.slug === "string" ? parsed.slug : undefined,
    description,
    timeout_seconds:
      typeof parsed.timeout_seconds === "number"
        ? parsed.timeout_seconds
        : undefined,
    tags: Array.isArray(parsed.tags)
      ? parsed.tags.filter((t): t is string => typeof t === "string")
      : undefined,
    input_schema:
      parsed.input_schema && typeof parsed.input_schema === "object"
        ? (parsed.input_schema as Record<string, unknown>)
        : undefined,
    output_schema:
      parsed.output_schema && typeof parsed.output_schema === "object"
        ? (parsed.output_schema as Record<string, unknown>)
        : undefined,
    code,
  };
}

function requireString(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`manifest missing string field "${key}"`);
  }
  return v;
}
