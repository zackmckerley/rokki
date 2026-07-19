import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Static guard: every table CREATEd in a migration must also have row-level
 * security enabled somewhere in the migration history.
 *
 * This exists because calendar_event_writes shipped in
 * 20260426070000_calendar_write.sql with no `ENABLE ROW LEVEL SECURITY` and no
 * policies — a cross-tenant read/write hole via PostgREST's default grants that
 * the DB-backed RLS suite never caught (it only tests tables it knows about).
 * A pure-SQL scan catches the whole class the moment a new table is added.
 *
 * If you intentionally add a table that must NOT have RLS (extremely rare —
 * effectively never for a public, user-reachable table), add it to ALLOWLIST
 * with a comment justifying why.
 */

const ALLOWLIST = new Set<string>([
  // (empty) — no table in the schema is intentionally RLS-free.
]);

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../supabase/migrations",
);

function collect() {
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const sql = files.map((f) => readFileSync(join(migrationsDir, f), "utf8")).join("\n");

  const created = new Set<string>();
  const dropped = new Set<string>();
  const rlsEnabled = new Set<string>();

  const normalize = (raw: string) => raw.replace(/"/g, "").trim().toLowerCase();
  // optional schema qualifier, e.g. public."foo".
  const SCHEMA = '(?:"?[a-z_][a-z0-9_]*"?\\.)?';

  // CREATE TABLE [IF NOT EXISTS] <name>
  const createRe = new RegExp(
    `create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?${SCHEMA}"?([a-z_][a-z0-9_]*)"?`,
    "gi",
  );
  for (const m of sql.matchAll(createRe)) created.add(normalize(m[1]));

  const dropRe = new RegExp(
    `drop\\s+table\\s+(?:if\\s+exists\\s+)?${SCHEMA}"?([a-z_][a-z0-9_]*)"?`,
    "gi",
  );
  for (const m of sql.matchAll(dropRe)) dropped.add(normalize(m[1]));

  // ALTER TABLE [ONLY] <name> ENABLE ROW LEVEL SECURITY — the name must be
  // immediately followed (within the same statement) by ENABLE ROW LEVEL
  // SECURITY. A statement-crossing wildcard would mis-pair distant ALTERs.
  const rlsRe = new RegExp(
    `alter\\s+table\\s+(?:only\\s+)?${SCHEMA}"?([a-z_][a-z0-9_]*)"?\\s+enable\\s+row\\s+level\\s+security`,
    "gi",
  );
  for (const m of sql.matchAll(rlsRe)) rlsEnabled.add(normalize(m[1]));

  return { files, created, dropped, rlsEnabled };
}

describe("migrations RLS coverage", () => {
  it("has migration files to scan", () => {
    const { files } = collect();
    expect(files.length).toBeGreaterThan(50);
  });

  it("every created (and not-dropped) table has RLS enabled", () => {
    const { created, dropped, rlsEnabled } = collect();
    const missing = [...created].filter(
      (t) => !dropped.has(t) && !rlsEnabled.has(t) && !ALLOWLIST.has(t),
    );
    expect(
      missing,
      `Tables created in migrations without ENABLE ROW LEVEL SECURITY: ${missing.join(", ")}`,
    ).toEqual([]);
  });
});
