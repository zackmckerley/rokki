#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Build the help index that the in-app help search reads.
 *
 * Walks docs/*.md, splits each doc into heading-anchored sections, and
 * emits apps/web/public/help-index.json. The shape is intentionally
 * dumb-JSON so the runtime helper can score with a tiny string-distance
 * function (no library — see CLAUDE.md "no new runtime deps").
 *
 * Run by hand:
 *   node apps/web/scripts/build-help-index.mjs
 *
 * Hooked into the build via the `prebuild` script in
 * apps/web/package.json. Plain ESM Node so we don't need tsx as a dep.
 */
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..", "..", "..");
const DOCS_DIR = join(ROOT, "docs");
const OUT_FILE = join(__dirname, "..", "public", "help-index.json");

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

function stripCodeFences(md) {
  return md.replace(/```[\s\S]*?```/g, "").replace(/^\s*```.*$/gm, "");
}

function trimSnippet(text, max = 800) {
  const cleaned = text
    .replace(/\s+/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(0, max - 1) + "…";
}

async function listDocs(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (e.isFile() && e.name.endsWith(".md")) out.push(join(dir, e.name));
  }
  return out.sort();
}

function parse(md, doc) {
  const stripped = stripCodeFences(md);
  const lines = stripped.split("\n");
  const sections = [];
  let docTitle = doc;

  let curHeading = "";
  let curLevel = 0;
  let curBody = [];
  function flush() {
    if (!curHeading) return;
    const snippet = trimSnippet(curBody.join(" "));
    const heading = curHeading.trim();
    sections.push({
      doc,
      doc_title: docTitle,
      anchor: slugify(heading),
      heading,
      level: curLevel,
      snippet,
      searchable: (heading + " " + snippet).toLowerCase(),
    });
  }

  for (const line of lines) {
    const m = /^(#{1,3})\s+(.+?)\s*$/.exec(line);
    if (m) {
      flush();
      const level = m[1].length;
      const heading = m[2].replace(/[#*`]/g, "").trim();
      if (level === 1 && !sections.length) docTitle = heading;
      curHeading = heading;
      curLevel = level;
      curBody = [];
    } else if (curHeading) {
      curBody.push(line);
    }
  }
  flush();
  return sections;
}

async function main() {
  console.log("[help-index] reading", DOCS_DIR);
  const files = await listDocs(DOCS_DIR);
  const all = [];
  for (const f of files) {
    const md = await readFile(f, "utf8");
    const docName = basename(f, ".md");
    const sections = parse(md, docName);
    all.push(...sections);
  }
  console.log(
    `[help-index] parsed ${files.length} docs → ${all.length} sections`,
  );
  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(
    OUT_FILE,
    JSON.stringify({ generated_at: new Date().toISOString(), sections: all }, null, 0),
    "utf8",
  );
  console.log("[help-index] wrote", OUT_FILE);
}

main().catch((e) => {
  console.error("[help-index] FAILED:", e);
  process.exit(1);
});
