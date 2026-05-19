#!/usr/bin/env node
/**
 * Mirror production data to the sandbox Supabase project.
 *
 * Runs through Supabase's management API (no DB password needed).
 *
 * Strategy per table:
 *   1. On sandbox, query information_schema to get the list of
 *      non-generated, non-identity-always columns we're allowed to
 *      insert into.
 *   2. On prod, SELECT jsonb_agg of those specific columns.
 *   3. On sandbox, TRUNCATE-like cleanup + INSERT from the JSON
 *      restricted to the column list.
 *
 * `SET session_replication_role = replica` disables triggers + FK
 * checks during the load so order doesn't matter and triggers don't
 * fire twice for the same row.
 *
 * Sandbox-only tables (modules_catalog, goals_*, etc.) are left
 * untouched — they don't exist on prod and don't appear in TABLES.
 */

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PROD = process.env.PROD_REF || "bwtmtpcgilvrkhougjdo";
const SANDBOX = process.env.SANDBOX_REF || "hqsdhwlokfwcitfitees";

if (!TOKEN) {
  console.error("SUPABASE_ACCESS_TOKEN env var required");
  process.exit(1);
}

const TABLES = [
  { schema: "auth", name: "users" },
  { schema: "auth", name: "identities" },
  { schema: "public", name: "profiles" },
  { schema: "public", name: "spaces" },
  { schema: "public", name: "space_members" },
  { schema: "public", name: "terminals" },
  { schema: "public", name: "terminal_members" },
  { schema: "public", name: "tasks" },
  { schema: "public", name: "task_assignees" },
  { schema: "public", name: "task_dependencies" },
  { schema: "public", name: "files" },
  { schema: "public", name: "comments" },
  { schema: "public", name: "message_threads" },
  { schema: "public", name: "thread_participants" },
  { schema: "public", name: "messages" },
  { schema: "public", name: "activity" },
  { schema: "public", name: "calendar_connections" },
  { schema: "public", name: "calendar_events" },
  { schema: "public", name: "invites" },
  { schema: "public", name: "notifications" },
  { schema: "public", name: "access_tokens" },
  { schema: "public", name: "api_keys" },
];

async function query(ref, sql) {
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`HTTP ${r.status} ${body.slice(0, 400)}`);
  }
  return r.json();
}

function sqlIdent(s) {
  return '"' + s.replaceAll('"', '""') + '"';
}
function sqlString(s) {
  return "'" + s.replaceAll("'", "''") + "'";
}

async function tableExists(ref, schema, name) {
  const r = await query(
    ref,
    `SELECT to_regclass('${schema}.${name}') IS NOT NULL AS exists`,
  );
  return r?.[0]?.exists === true;
}

/**
 * Insertable columns on a table — excludes generated columns and
 * identity-always columns. Returns the list in column ORDER (matters
 * for jsonb_populate_record path).
 */
async function insertableColumns(ref, schema, name) {
  const r = await query(
    ref,
    `SELECT column_name, ordinal_position
     FROM information_schema.columns
     WHERE table_schema = ${sqlString(schema)}
       AND table_name = ${sqlString(name)}
       AND is_generated = 'NEVER'
       AND identity_generation IS DISTINCT FROM 'ALWAYS'
     ORDER BY ordinal_position`,
  );
  return r.map((row) => row.column_name);
}

async function dumpTable(schema, name, cols) {
  const exists = await tableExists(PROD, schema, name);
  if (!exists) return { exists: false, count: 0, json: "[]" };
  // SELECT specific columns into json
  const colJsonPairs = cols
    .map((c) => `${sqlString(c)}, t.${sqlIdent(c)}`)
    .join(", ");
  const sql = `
    SELECT
      COALESCE(jsonb_agg(jsonb_build_object(${colJsonPairs})), '[]'::jsonb)::text AS data,
      count(*) AS n
    FROM ${sqlIdent(schema)}.${sqlIdent(name)} t
  `;
  const r = await query(PROD, sql);
  return {
    exists: true,
    count: Number(r?.[0]?.n ?? 0),
    json: r?.[0]?.data ?? "[]",
  };
}

async function loadTable(schema, name, cols, json) {
  const exists = await tableExists(SANDBOX, schema, name);
  if (!exists) return { skipped: true, reason: "not on sandbox" };
  const colList = cols.map(sqlIdent).join(", ");
  const sql = `
    SET session_replication_role = replica;
    DELETE FROM ${sqlIdent(schema)}.${sqlIdent(name)};
    INSERT INTO ${sqlIdent(schema)}.${sqlIdent(name)} (${colList})
    SELECT ${colList} FROM jsonb_populate_recordset(
      NULL::${sqlIdent(schema)}.${sqlIdent(name)},
      ${sqlString(json)}::jsonb
    );
    SET session_replication_role = origin;
  `;
  await query(SANDBOX, sql);
  const r = await query(
    SANDBOX,
    `SELECT count(*) AS n FROM ${sqlIdent(schema)}.${sqlIdent(name)}`,
  );
  return { loaded: Number(r?.[0]?.n ?? 0) };
}

async function main() {
  console.log(`Mirroring prod (${PROD}) → sandbox (${SANDBOX})\n`);
  const summary = [];
  for (const t of TABLES) {
    process.stdout.write(`  ${t.schema}.${t.name} … `);
    try {
      // Use the SANDBOX column list (we need cols that exist on
      // sandbox; prod columns are a superset or equal). If prod
      // has extra cols we don't know about on sandbox, they're
      // discarded — that's the right behavior.
      const sExists = await tableExists(SANDBOX, t.schema, t.name);
      if (!sExists) {
        console.log("skipped (not on sandbox)");
        summary.push({ table: `${t.schema}.${t.name}`, status: "skipped: sandbox missing" });
        continue;
      }
      const cols = await insertableColumns(SANDBOX, t.schema, t.name);
      if (cols.length === 0) {
        console.log("skipped (no insertable columns)");
        summary.push({ table: `${t.schema}.${t.name}`, status: "skipped: no cols" });
        continue;
      }
      const d = await dumpTable(t.schema, t.name, cols);
      if (!d.exists) {
        console.log("skipped (not on prod)");
        summary.push({ table: `${t.schema}.${t.name}`, status: "skipped: prod missing" });
        continue;
      }
      const r = await loadTable(t.schema, t.name, cols, d.json);
      if (r.skipped) {
        console.log(`skipped: ${r.reason}`);
        summary.push({ table: `${t.schema}.${t.name}`, status: `skipped: ${r.reason}` });
      } else {
        console.log(`${d.count} → ${r.loaded}`);
        summary.push({
          table: `${t.schema}.${t.name}`,
          status: d.count === r.loaded ? "ok" : `MISMATCH ${d.count}→${r.loaded}`,
        });
      }
    } catch (e) {
      console.log(`FAILED: ${e.message.slice(0, 220)}`);
      summary.push({
        table: `${t.schema}.${t.name}`,
        status: `error: ${e.message.slice(0, 100)}`,
      });
    }
  }
  console.log("\nSummary:");
  for (const s of summary) console.log(`  ${s.table.padEnd(28)} ${s.status}`);
  const failed = summary.filter((s) => /error|MISMATCH/.test(s.status));
  if (failed.length > 0) {
    console.log(`\n${failed.length} issue(s).`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
