#!/usr/bin/env node
/**
 * @rokki/cli — the Rokki command-line client.
 *
 * Commands:
 *   rokki login <token>              store a personal access token
 *   rokki logout                     delete the stored token
 *   rokki whoami                     show the token + endpoint currently in use
 *   rokki ls [tools|terminals]       list resources the token can see
 *   rokki publish <manifest.json>    publish a new tool
 *   rokki version                    print cli version
 *
 * Config lives at ~/.rokki/config.json. Override the base URL via
 * ROKKI_BASE_URL or `--base https://staging.rokki.ai`.
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { readToolManifest } from "./manifest.js";

const PKG_VERSION = "0.1.0";

interface Config {
  base_url: string;
  token?: string;
}

const CONFIG_DIR = path.join(os.homedir(), ".rokki");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

async function loadConfig(): Promise<Config> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as Config;
  } catch {
    return { base_url: "http://localhost:3000" };
  }
}

async function saveConfig(c: Config): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(c, null, 2) + "\n", {
    mode: 0o600,
  });
}

function usage(): void {
  process.stdout.write(`rokki ${PKG_VERSION}

Usage:
  rokki login <rk_token>            store a personal access token
  rokki logout                      forget the stored token
  rokki whoami                      show current identity + endpoint
  rokki ls tools                    list visible tools
  rokki ls terminals                list terminals (membership-scoped)
  rokki publish <manifest.json>     register or update a tool
  rokki version                     print cli version

Env overrides:
  ROKKI_BASE_URL    API base (default http://localhost:3000)
  ROKKI_TOKEN       personal token (overrides config)
`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  // Global flags.
  const baseFlag = argv.indexOf("--base");
  let baseOverride: string | undefined;
  if (baseFlag >= 0) {
    baseOverride = argv[baseFlag + 1];
    argv.splice(baseFlag, 2);
  }

  const cmd = argv[0];
  const config = await loadConfig();
  if (baseOverride) config.base_url = baseOverride;
  if (process.env.ROKKI_BASE_URL) config.base_url = process.env.ROKKI_BASE_URL;
  if (process.env.ROKKI_TOKEN) config.token = process.env.ROKKI_TOKEN;

  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    usage();
    return;
  }
  if (cmd === "version" || cmd === "--version" || cmd === "-v") {
    process.stdout.write(`${PKG_VERSION}\n`);
    return;
  }

  if (cmd === "login") {
    const token = argv[1];
    if (!token || !/^rk_(live|test)_/.test(token)) {
      fail("expected a personal access token (rk_live_… or rk_test_…)");
    }
    config.token = token!;
    await saveConfig(config);
    process.stdout.write(`✓ stored token, endpoint ${config.base_url}\n`);
    return;
  }

  if (cmd === "logout") {
    delete config.token;
    await saveConfig(config);
    process.stdout.write("✓ forgot token\n");
    return;
  }

  if (cmd === "whoami") {
    process.stdout.write(
      `endpoint: ${config.base_url}\ntoken:    ${
        config.token ? `${config.token.slice(0, 10)}…` : "(none — run rokki login)"
      }\n`,
    );
    if (!config.token) return;
    const r = await fetch(`${config.base_url}/api/v1/me`, {
      headers: { Authorization: `Bearer ${config.token}` },
    });
    if (!r.ok) {
      fail(`whoami failed: HTTP ${r.status}`);
    }
    const body = (await r.json()) as {
      data?: { user?: { email?: string; id?: string } };
    };
    process.stdout.write(
      `user:     ${body.data?.user?.email ?? "?"} (${body.data?.user?.id?.slice(0, 8) ?? "?"})\n`,
    );
    return;
  }

  if (cmd === "ls") {
    requireToken(config);
    const kind = argv[1];
    if (kind === "tools") {
      const r = await fetch(`${config.base_url}/api/v1/tools`, {
        headers: { Authorization: `Bearer ${config.token!}` },
      });
      const body = (await r.json()) as {
        data?: Array<{
          slug: string;
          name: string;
          current_version: string;
          visibility: string;
        }>;
      };
      const rows = body.data ?? [];
      if (rows.length === 0) {
        process.stdout.write("(no tools)\n");
        return;
      }
      for (const t of rows) {
        process.stdout.write(
          `${pad(t.slug, 30)} ${pad(t.current_version, 10)} ${pad(t.visibility, 10)} ${t.name}\n`,
        );
      }
      return;
    }
    if (kind === "terminals") {
      const r = await fetch(`${config.base_url}/api/v1/projects`, {
        headers: { Authorization: `Bearer ${config.token!}` },
      });
      const body = (await r.json()) as {
        data?: Array<{ ticker: string; name: string; status: string }>;
      };
      const rows = body.data ?? [];
      for (const t of rows) {
        process.stdout.write(
          `${pad(t.ticker, 10)} ${pad(t.status, 12)} ${t.name}\n`,
        );
      }
      return;
    }
    fail("usage: rokki ls [tools|terminals]");
  }

  if (cmd === "publish") {
    requireToken(config);
    const manifestPath = argv[1];
    if (!manifestPath) fail("usage: rokki publish <manifest.json>");
    const m = await readToolManifest(manifestPath!);
    const r = await fetch(`${config.base_url}/api/v1/tools`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.token!}`,
      },
      body: JSON.stringify(m),
    });
    if (!r.ok) {
      const body = (await r.json().catch(() => ({}))) as {
        errors?: { message: string }[];
      };
      fail(body.errors?.[0]?.message ?? `HTTP ${r.status}`);
    }
    const body = (await r.json()) as { data?: { slug?: string } };
    process.stdout.write(`✓ published ${body.data?.slug}\n`);
    return;
  }

  usage();
  process.exit(2);
}

function requireToken(c: Config): asserts c is Config & { token: string } {
  if (!c.token) fail("not logged in — run `rokki login <rk_...>`");
}

function pad(s: string, n: number): string {
  return (s ?? "").padEnd(n).slice(0, n);
}

function fail(msg: string): never {
  process.stderr.write(`rokki: ${msg}\n`);
  process.exit(1);
}

main().catch((e) => {
  fail(e instanceof Error ? e.message : String(e));
});
