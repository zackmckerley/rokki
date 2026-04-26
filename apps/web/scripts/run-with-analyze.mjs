#!/usr/bin/env node
/**
 * Cross-platform shim for `ANALYZE=true next build`.
 *
 * Spawns `next build` with `ANALYZE=true` injected into the environment.
 * This avoids forcing Windows devs to install `cross-env` just to run
 * the bundle-size check locally.
 *
 * Implementation note: we resolve the local Next package's CLI entry
 * point and run it with the current node executable. This sidesteps
 * the .cmd shim + `shell: true` quoting bug on Windows when paths
 * contain spaces (e.g. `C:\Users\my user\repo`).
 */

import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, "..");
const require = createRequire(import.meta.url);

// Resolve the actual next/dist/bin/next entry — avoids the platform-
// specific .cmd / .ps1 / shell-script wrappers entirely.
const nextPkg = require.resolve("next/package.json", { paths: [WEB_ROOT] });
const nextRoot = dirname(nextPkg);
const nextBin = resolve(nextRoot, "dist", "bin", "next");

const child = spawn(process.execPath, [nextBin, "build"], {
  cwd: WEB_ROOT,
  stdio: "inherit",
  env: { ...process.env, ANALYZE: "true" },
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
