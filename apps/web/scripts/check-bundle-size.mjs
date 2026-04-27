#!/usr/bin/env node
/**
 * Bundle-size budget enforcer.
 *
 * Reads `.next/build-manifest.json` + `.next/app-build-manifest.json`,
 * gzips each chunk, sums per route (de-duplicating shared chunks the
 * way Next does for "First Load JS"), and exits non-zero if any route
 * exceeds its budget OR regresses against the checked-in baseline.
 *
 * Why not just parse `next build` stdout? — that table is human-
 * formatted (kB rounded) and shifts between Next versions. The
 * manifest JSON is Next's stable internal contract.
 *
 * Two failure modes:
 *
 *   1. Absolute budget breach. Per-route caps come from BUDGETS.
 *      Set `--no-budget` to skip this check (regression-only mode).
 *
 *   2. Regression vs baseline. The repo ships a baseline at
 *      `apps/web/scripts/bundle-baseline.json`. A route that grows
 *      more than `REGRESSION_KB_TOLERANCE` (default 5 KB gzipped)
 *      vs its baseline fails the check.
 *
 * Update the baseline (intentional growth, e.g. a new dependency):
 *
 *   pnpm bundle:check --update-baseline
 *
 * Then commit the diff. Reviewers see exactly how much the
 * bundle grew per route in the same PR.
 *
 * Run locally:
 *   pnpm -C apps/web bundle:check
 */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, "..");
const BUILD_DIR = join(WEB_ROOT, ".next");
const MANIFEST_PATH = join(BUILD_DIR, "build-manifest.json");
const APP_MANIFEST_PATH = join(BUILD_DIR, "app-build-manifest.json");
const BASELINE_PATH = join(__dirname, "bundle-baseline.json");

const REGRESSION_KB_TOLERANCE = 5;

const args = new Set(process.argv.slice(2));
const UPDATE_BASELINE = args.has("--update-baseline");
const CHECK_BUDGET = !args.has("--no-budget");
const CHECK_REGRESSION = !args.has("--no-regression");

/**
 * Per-route first-load-JS budgets in KB (gzipped). The `pattern` is
 * matched against the page key Next uses (App Router routes look like
 * `/login/page`, `/admin/page`, `/p/[ticker]/page`).
 *
 * Order matters: the first matching budget wins, so put specific
 * patterns first.
 */
const BUDGETS = [
  { name: "Login", pattern: /^\/login(\/page)?$/, kb: 100 },
  { name: "Dashboard", pattern: /^\/(page)?$/, kb: 250 },
  { name: "Terminal", pattern: /^\/p\/\[ticker\]/, kb: 300 },
  { name: "Admin", pattern: /^\/admin(\/|$)/, kb: 200 },
  // Catch-all for any other public page.
  { name: "Other", pattern: /.*/, kb: 150 },
];

function bytesToKb(bytes) {
  return Math.round((bytes / 1024) * 10) / 10;
}

function fmtKb(kb) {
  return `${kb.toFixed(1)} KB`;
}

function fmtDelta(deltaKb) {
  if (deltaKb === undefined || deltaKb === null) return "—";
  if (Math.abs(deltaKb) < 0.05) return "0";
  const sign = deltaKb > 0 ? "+" : "";
  return `${sign}${deltaKb.toFixed(1)} KB`;
}

/** Pick the budget for a given route key. First match wins. */
function budgetFor(routeKey) {
  for (const b of BUDGETS) {
    if (b.pattern.test(routeKey)) return b;
  }
  return { name: "Unknown", pattern: /.*/, kb: 150 };
}

/**
 * Cache: chunk-path → { raw, gz } so a chunk shared across 30 routes
 * is read + gzipped once, not 30 times.
 */
const sizeCache = new Map();

async function chunkSize(rel) {
  if (sizeCache.has(rel)) return sizeCache.get(rel);
  const full = join(BUILD_DIR, rel);
  try {
    const buf = await readFile(full);
    const gz = gzipSync(buf, { level: 9 });
    const out = { raw: buf.byteLength, gz: gz.byteLength };
    sizeCache.set(rel, out);
    return out;
  } catch {
    const out = { raw: 0, gz: 0 };
    sizeCache.set(rel, out);
    return out;
  }
}

/**
 * Sum gzipped sizes of a set of chunk paths, de-duplicated.
 * Returns gzipped bytes — that's what Next reports as "First Load JS"
 * in its build output and what budgets are written against.
 */
async function sizeOf(chunks) {
  const unique = Array.from(new Set(chunks));
  let totalGz = 0;
  for (const c of unique) {
    const s = await chunkSize(c);
    totalGz += s.gz;
  }
  return totalGz;
}

async function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) return null;
  try {
    const raw = JSON.parse(await readFile(BASELINE_PATH, "utf8"));
    // Baseline shape: { routes: { "/login/page": 187.8, ... }, generated: "..." }
    return raw.routes ?? raw;
  } catch {
    return null;
  }
}

async function main() {
  if (!existsSync(MANIFEST_PATH)) {
    console.error(
      `bundle:check expected ${MANIFEST_PATH} — did you run 'next build' first?`,
    );
    console.error(
      "Run 'pnpm bundle:check' (which builds first), not this script directly.",
    );
    process.exit(2);
  }

  const buildManifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  const appManifest = existsSync(APP_MANIFEST_PATH)
    ? JSON.parse(await readFile(APP_MANIFEST_PATH, "utf8"))
    : { pages: {} };

  // App Router pages live under app-build-manifest.json#pages. Pages
  // Router pages (and shared `_app`/`_error`) live under
  // build-manifest.json#pages. Merge both — single budget table
  // regardless of router.
  const allPages = {
    ...buildManifest.pages,
    ...appManifest.pages,
  };

  // rootMainFiles = framework chunks loaded on every page (React,
  // webpack runtime, Next runtime). Add to every route so the budget
  // matches "First Load JS" in Next's build output.
  const rootChunks = buildManifest.rootMainFiles ?? [];

  const baseline = await loadBaseline();
  const newBaseline = {};

  const rows = [];
  for (const [routeKey, chunks] of Object.entries(allPages)) {
    if (!Array.isArray(chunks)) continue;
    // Skip route handlers (App Router API endpoints) — they don't ship
    // first-load JS to a user's browser. Same for framework internals.
    if (routeKey.endsWith("/route")) continue;
    if (routeKey.startsWith("/_")) continue;

    const allChunks = [...rootChunks, ...chunks];
    const bytes = await sizeOf(allChunks);
    const kb = bytesToKb(bytes);
    const budget = budgetFor(routeKey);
    const overBudget = kb > budget.kb;
    const baselineKb = baseline?.[routeKey];
    const delta = baselineKb !== undefined ? kb - baselineKb : undefined;
    const regressed =
      delta !== undefined && delta > REGRESSION_KB_TOLERANCE;

    newBaseline[routeKey] = kb;

    rows.push({
      routeKey,
      kb,
      budgetName: budget.name,
      budgetKb: budget.kb,
      overBudget,
      delta,
      regressed,
    });
  }

  // Sort: regressions first, then over-budget, then by size desc.
  rows.sort((a, b) => {
    if (a.regressed !== b.regressed) return a.regressed ? -1 : 1;
    if (a.overBudget !== b.overBudget) return a.overBudget ? -1 : 1;
    return b.kb - a.kb;
  });

  // Print the table.
  console.log("");
  console.log("Bundle-size budget check (gzipped, First Load JS)");
  console.log("=".repeat(108));
  console.log(
    [
      "Route".padEnd(42),
      "Size".padStart(10),
      "Budget".padStart(10),
      "Δ baseline".padStart(14),
      "Status".padStart(20),
    ].join("  "),
  );
  console.log("-".repeat(108));

  let budgetBreaches = 0;
  let regressions = 0;
  for (const r of rows) {
    let status = "ok";
    if (r.regressed && r.overBudget) status = "REGRESSED, OVER";
    else if (r.regressed) status = "REGRESSED";
    else if (r.overBudget) status = "OVER";
    if (r.regressed) regressions++;
    if (r.overBudget) budgetBreaches++;
    console.log(
      [
        r.routeKey.slice(0, 42).padEnd(42),
        fmtKb(r.kb).padStart(10),
        `${r.budgetKb} KB`.padStart(10),
        fmtDelta(r.delta).padStart(14),
        status.padStart(20),
      ].join("  "),
    );
  }
  console.log("=".repeat(108));
  console.log(
    `${rows.length} route(s) checked. ${budgetBreaches} over budget. ${regressions} regressed (>${REGRESSION_KB_TOLERANCE} KB) vs baseline.`,
  );

  if (UPDATE_BASELINE) {
    await writeFile(
      BASELINE_PATH,
      JSON.stringify(
        {
          generated: new Date().toISOString(),
          tolerance_kb: REGRESSION_KB_TOLERANCE,
          routes: newBaseline,
        },
        null,
        2,
      ) + "\n",
    );
    console.log("");
    console.log(`Baseline updated → ${BASELINE_PATH}`);
    console.log("Commit the diff so reviewers see what grew.");
    process.exit(0);
  }

  // Two failure conditions, both gated by their respective flags:
  //   - Regression: route grew >5 KB gzipped vs the checked-in baseline
  //   - Budget breach: route exceeds its absolute budget AND wasn't
  //     already over budget in the baseline (so we don't fail forever
  //     on a pre-existing breach the team hasn't paid down yet)
  let preexistingBreaches = 0;
  let newBreaches = 0;
  for (const r of rows) {
    if (!r.overBudget) continue;
    const wasAlreadyOver =
      baseline?.[r.routeKey] !== undefined && baseline[r.routeKey] > r.budgetKb;
    if (wasAlreadyOver) preexistingBreaches++;
    else newBreaches++;
  }

  let exitCode = 0;
  if (CHECK_REGRESSION && regressions > 0) {
    console.error("");
    console.error(
      `${regressions} route(s) regressed >${REGRESSION_KB_TOLERANCE} KB vs baseline.`,
    );
    console.error(
      "If intentional, run `pnpm bundle:check --update-baseline` and commit the diff.",
    );
    exitCode = 1;
  }
  if (CHECK_BUDGET && newBreaches > 0) {
    console.error("");
    console.error(
      `${newBreaches} route(s) breach budget for the first time.`,
    );
    console.error(
      `(${preexistingBreaches} other route(s) were already over budget — see baseline.)`,
    );
    console.error(
      "Inspect with `pnpm -C apps/web bundle:analyze` and open .next/analyze/*.html.",
    );
    exitCode = 1;
  }

  if (exitCode === 0) {
    console.log("");
    if (preexistingBreaches > 0) {
      console.log(
        `OK — no regressions and no new budget breaches. (${preexistingBreaches} pre-existing over-budget route(s) carried over from baseline.)`,
      );
    } else {
      console.log("OK — all routes within budget, no regressions.");
    }
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error("bundle:check crashed:", err);
  process.exit(2);
});
