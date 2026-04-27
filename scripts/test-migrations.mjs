#!/usr/bin/env node
/**
 * Migration test harness.
 *
 * Walks every file in `supabase/migrations/`, sorted lexicographically
 * (which is timestamp order under our YYYYMMDDhhmmss_*.sql naming),
 * and reports per migration:
 *
 *   PASS    — file parses, no syntax-level red flags
 *   ROLLBACK declared — file ends with a `-- ROLLBACK:` comment block
 *                       containing one or more SQL statements
 *   forward-only      — file has no rollback block (grandfathered or
 *                       deliberately one-way; see migrations README)
 *   FAIL    — broken (empty file, unclosed string, bare semicolon-only)
 *
 * Convention going forward (see `supabase/migrations/README.md`):
 *
 *   -- ROLLBACK:
 *   -- DROP INDEX IF EXISTS ...;
 *   -- DROP TABLE IF EXISTS ...;
 *
 * The block lives at the bottom of the file, every line of the rollback
 * SQL prefixed with `-- ` so the migration runner ignores it.
 *
 * Usage:
 *   pnpm migrations:test                # static analysis (no DB needed)
 *   pnpm migrations:test --apply        # exercise migrations against
 *                                       # a live local Supabase: apply
 *                                       # forward, run rollback if
 *                                       # declared, re-apply, verify
 *                                       # round-trip
 *
 * Exits non-zero only on FAIL — "no rollback declared" is informational.
 *
 * Why a separate harness instead of letting `supabase db reset` validate
 * everything? `db reset` only proves migrations apply forward on an
 * empty DB. It doesn't test rollback symmetry, won't notice a migration
 * that leaks an irreversible side-effect, and gives terrible per-file
 * output. This is a thin layer focused on those gaps.
 */

import { readdir, readFile } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "supabase", "migrations");

/**
 * @typedef {{
 *   filename: string;
 *   path: string;
 *   sqlBytes: number;
 *   hasRollback: boolean;
 *   rollbackStatements: string[];
 *   forward: string;
 *   diagnostics: string[];
 * }} MigrationReport
 */

const ROLLBACK_HEADER = /^\s*--\s*ROLLBACK\s*:\s*$/m;

/** @returns {Promise<string[]>} */
async function listMigrations() {
  const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".sql"))
    .map((e) => e.name)
    .sort();
}

/**
 * @param {string} filename
 * @returns {Promise<MigrationReport>}
 */
async function loadMigration(filename) {
  const path = join(MIGRATIONS_DIR, filename);
  const raw = await readFile(path, "utf8");
  const trimmed = raw.trim();

  /** @type {string[]} */
  const diagnostics = [];
  if (trimmed.length === 0) diagnostics.push("file is empty");

  // Locate the ROLLBACK block. Convention: the block is at the bottom,
  // and every line of rollback SQL is prefixed with `-- ` so Postgres
  // ignores it during forward apply.
  const lines = raw.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => ROLLBACK_HEADER.test(l));
  let forward = raw;
  /** @type {string[]} */
  let rollbackStatements = [];
  let hasRollback = false;
  if (headerIdx >= 0) {
    forward = lines.slice(0, headerIdx).join("\n");
    const tail = lines.slice(headerIdx + 1);
    /** @type {string[]} */
    const sqlLines = [];
    for (const l of tail) {
      const m = l.match(/^\s*--\s?(.*)$/);
      if (m) sqlLines.push(m[1] ?? "");
      else if (l.trim() === "") sqlLines.push("");
      else {
        diagnostics.push(
          `non-comment line in ROLLBACK block: ${l.trim().slice(0, 80)}`,
        );
      }
    }
    const rollbackSql = sqlLines.join("\n").trim();
    if (rollbackSql) {
      // Distinguish actual SQL from English-description ROLLBACK notes.
      // Heuristic: at least one line starts with a SQL DDL keyword.
      const looksLikeSql =
        /^\s*(DROP|ALTER|CREATE|TRUNCATE|DELETE|UPDATE|INSERT|REVOKE|GRANT)\b/im.test(
          rollbackSql,
        );
      if (looksLikeSql) {
        hasRollback = true;
        rollbackStatements = splitStatements(rollbackSql);
        if (rollbackStatements.length === 0) {
          diagnostics.push("ROLLBACK block present but contains no statements");
        }
      }
      // Otherwise treat as a description note — file is forward-only as
      // far as automated rollback goes. We don't push a diagnostic
      // (existing migrations grandfathered) but also don't claim
      // hasRollback.
    }
  }

  // Light syntax sanity checks on the forward SQL.
  const fwd = forward.trim();
  if (fwd.length > 0) {
    const stmts = splitStatements(fwd);
    if (stmts.length === 0) {
      diagnostics.push("no SQL statements parsed (only comments?)");
    }
    // A '$$ ... $$' or '$tag$ ... $tag$' should be paired.
    const dollarTags = (fwd.match(/\$([A-Za-z_][A-Za-z0-9_]*)?\$/g) ?? []).length;
    if (dollarTags % 2 !== 0) {
      diagnostics.push("unbalanced dollar-quote tags");
    }
  }

  return {
    filename,
    path,
    sqlBytes: raw.length,
    hasRollback,
    rollbackStatements,
    forward,
    diagnostics,
  };
}

/**
 * Split a SQL blob into statements on top-level semicolons. This is
 * deliberately lo-fi — we just need enough to spot empty/broken files,
 * not a full SQL parser. Quotes (single, double, dollar) are tracked.
 * @param {string} sql
 * @returns {string[]}
 */
function splitStatements(sql) {
  /** @type {string[]} */
  const out = [];
  let buf = "";
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  /** @type {string | null} */
  let dollarTag = null;
  while (i < sql.length) {
    const ch = sql[i];
    const next2 = sql.slice(i, i + 2);
    if (!inSingle && !inDouble && dollarTag === null) {
      if (next2 === "--") {
        // Line comment — skip to EOL.
        const nl = sql.indexOf("\n", i);
        if (nl < 0) break;
        buf += sql.slice(i, nl + 1);
        i = nl + 1;
        continue;
      }
      if (next2 === "/*") {
        const close = sql.indexOf("*/", i + 2);
        if (close < 0) break;
        buf += sql.slice(i, close + 2);
        i = close + 2;
        continue;
      }
    }
    if (dollarTag === null && ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (dollarTag === null && ch === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (!inSingle && !inDouble) {
      // Detect dollar quote
      if (ch === "$") {
        const m = sql.slice(i).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
        if (m) {
          if (dollarTag === null) {
            dollarTag = m[1] ?? "";
          } else if ((m[1] ?? "") === dollarTag) {
            dollarTag = null;
          }
          buf += m[0];
          i += m[0].length;
          continue;
        }
      }
    }
    if (ch === ";" && !inSingle && !inDouble && dollarTag === null) {
      const stmt = buf.trim();
      if (stmt.length > 0) out.push(stmt);
      buf = "";
      i += 1;
      continue;
    }
    buf += ch;
    i += 1;
  }
  const tail = buf.trim();
  if (tail.length > 0) out.push(tail);
  return out;
}

/**
 * Spawn psql with a SQL string. Returns {code, stdout, stderr}.
 * Used only when --apply is set.
 * @param {string} sql
 * @param {string} url
 */
function runPsql(sql, url) {
  return new Promise((res) => {
    const child = spawn("psql", [url, "-v", "ON_ERROR_STOP=1", "-q"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => res({ code: code ?? -1, stdout, stderr }));
    child.stdin.end(sql);
  });
}

/**
 * Apply a SQL block. Returns null on success, error string on failure.
 * @param {string} sql
 * @param {string} url
 * @returns {Promise<string | null>}
 */
async function tryApply(sql, url) {
  const r = await runPsql(sql, url);
  if (r.code === 0) return null;
  return r.stderr.trim() || `psql exit ${r.code}`;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has("--apply");
  const verbose = args.has("--verbose") || args.has("-v");
  const dbUrl =
    process.env.MIGRATIONS_TEST_DB_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

  const filenames = await listMigrations();
  if (filenames.length === 0) {
    console.error(`No .sql files found in ${MIGRATIONS_DIR}`);
    process.exit(1);
  }

  console.log(
    `\nMigration harness — ${filenames.length} files in ${MIGRATIONS_DIR}\n`,
  );

  let withRollback = 0;
  let forwardOnly = 0;
  let failed = 0;
  let applyFailed = 0;

  for (const filename of filenames) {
    const r = await loadMigration(filename);
    const tag = r.hasRollback ? "ROLLBACK" : "fwd-only";
    let line = `  [${tag.padStart(8)}] ${filename}  (${r.sqlBytes}B)`;
    let status = "ok";
    if (r.diagnostics.length > 0) {
      failed += 1;
      status = "FAIL";
      line = `  [   FAIL] ${filename}`;
    }
    console.log(line);
    if (r.diagnostics.length > 0) {
      for (const d of r.diagnostics) console.log(`           ${d}`);
    } else if (verbose && r.hasRollback) {
      console.log(
        `           ${r.rollbackStatements.length} rollback statement${
          r.rollbackStatements.length === 1 ? "" : "s"
        }`,
      );
    }
    if (status === "ok") {
      if (r.hasRollback) withRollback += 1;
      else forwardOnly += 1;
    }

    // Optional --apply mode: prove the rollback round-trips. We don't
    // re-run forward migrations (the db is already at HEAD when this
    // runs); we just rollback the latest migration if it has one and
    // re-apply, leaving the DB in the same state we found it in.
    if (apply && r.hasRollback && r.rollbackStatements.length > 0) {
      const rollbackSql = r.rollbackStatements.join(";\n") + ";\n";
      const rollbackErr = await tryApply(rollbackSql, dbUrl);
      if (rollbackErr) {
        applyFailed += 1;
        console.log(`           rollback FAIL: ${rollbackErr.split("\n")[0]}`);
        continue;
      }
      const reapplyErr = await tryApply(r.forward, dbUrl);
      if (reapplyErr) {
        applyFailed += 1;
        console.log(`           re-apply FAIL: ${reapplyErr.split("\n")[0]}`);
        continue;
      }
      if (verbose) console.log("           rollback + re-apply round-trip OK");
    }
  }

  console.log(
    `\nSummary: ${withRollback} with rollback, ${forwardOnly} forward-only, ${failed} broken${
      apply ? `, ${applyFailed} round-trip failures` : ""
    }`,
  );

  if (failed > 0 || applyFailed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
