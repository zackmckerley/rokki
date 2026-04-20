#!/usr/bin/env node
/**
 * One-shot codebase rename for orgs→spaces, projects→terminals.
 *
 * Only touches TypeScript/JavaScript/JSON files under apps/* and packages/*.
 * Documentation, migrations, and human copy in UI strings is handled by
 * hand afterwards.
 *
 * Usage: node scripts/rename-terminology.mjs
 */

import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";

const ROOTS = ["apps/web/src", "apps/mcp-server/src", "apps/indexer/src", "apps/tool-executor/src", "packages/db/src"];
const EXTS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"]);

// Ordered most-specific → least-specific to avoid double-rewriting.
const REPLACEMENTS = [
  // FK relationship names
  ["org_members_org_id_fkey", "space_members_space_id_fkey"],
  ["projects_org_id_fkey", "terminals_space_id_fkey"],
  ["project_members_project_id_fkey", "terminal_members_terminal_id_fkey"],
  ["project_members_user_id_fkey", "terminal_members_user_id_fkey"],
  ["org_members_user_id_fkey", "space_members_user_id_fkey"],
  // FK join selector syntax in Supabase .select
  ["orgs!org_members_org_id_fkey", "spaces!space_members_space_id_fkey"],
  ["projects!project_members_project_id_fkey", "terminals!terminal_members_terminal_id_fkey"],
  ["projects!projects_org_id_fkey", "terminals!terminals_space_id_fkey"],
  // .from("…") selectors
  ['.from("orgs")', '.from("spaces")'],
  ['.from("org_members")', '.from("space_members")'],
  ['.from("projects")', '.from("terminals")'],
  ['.from("project_members")', '.from("terminal_members")'],
  // RPC function names
  ["is_org_member", "is_space_member"],
  ["is_org_admin", "is_space_admin"],
  ["is_project_member", "is_terminal_member"],
  ["is_project_manager", "is_terminal_manager"],
  // Column renames — be careful: project_role is BOTH a type name AND a
  // function name. project_role -> terminal_role hits both.
  ["project_role", "terminal_role"],
  // Column-name substrings — order matters so we don't half-rewrite
  ["approver_org_id", "approver_space_id"],
  ["approver_project_id", "approver_terminal_id"],
  ["owner_org_id", "owner_space_id"],
  ["org_id", "space_id"],
  ["project_id", "terminal_id"],
  // Activity action enum literals
  ['"project.create"', '"terminal.create"'],
  ['"project.update"', '"terminal.update"'],
  ['"project.archive"', '"terminal.archive"'],
  ["'project.create'", "'terminal.create'"],
  ["'project.update'", "'terminal.update'"],
  ["'project.archive'", "'terminal.archive'"],
];

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next" || e.name === "dist") continue;
      yield* walk(p);
    } else if (EXTS.has(extname(e.name))) {
      yield p;
    }
  }
}

let touched = 0;
let scanned = 0;
for (const root of ROOTS) {
  for await (const path of walk(root)) {
    scanned++;
    let body = await readFile(path, "utf8");
    const before = body;
    for (const [from, to] of REPLACEMENTS) {
      body = body.split(from).join(to);
    }
    if (body !== before) {
      await writeFile(path, body);
      touched++;
      console.log(`edited ${path}`);
    }
  }
}
console.log(`\nscanned ${scanned} files, edited ${touched}`);
