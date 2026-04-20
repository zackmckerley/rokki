/**
 * Worker thread entrypoint. Receives a single message describing a JS tool
 * invocation, executes the tool function with the given input, and posts
 * the result (or error) back.
 *
 * SECURITY NOTE (Phase 3a):
 *   - Worker threads share the host's filesystem / network namespace. This
 *     is acceptable when tools are authored by trusted users in a private
 *     workspace. Before any public tool registry, swap this runner for a
 *     containerized sandbox (Firecracker VM or Azure Container Apps with a
 *     read-only FS and egress allowlist, per docs/06_TOOLS.md §6.5).
 *   - We DO terminate() the worker on timeout, which kills any in-flight
 *     fetch/DB call, and we redact `process.env` before handing it to the
 *     tool so nothing sensitive leaks in.
 */

import { parentPort, workerData } from "node:worker_threads";

interface Job {
  entrypoint: string;
  scripts: Record<string, string>;
  input: unknown;
  env?: Record<string, string>;
}

const job = workerData as Job;

async function run() {
  try {
    const code = job.scripts[job.entrypoint];
    if (!code) {
      throw new Error(`entrypoint ${job.entrypoint} not found in scripts`);
    }

    const logs: string[] = [];
    const logCap = 200; // lines
    const mkLog =
      (level: string) =>
      (...args: unknown[]) => {
        if (logs.length >= logCap) return;
        logs.push(
          `[${level}] ${args
            .map((a) =>
              typeof a === "string" ? a : safeStringify(a, 2000),
            )
            .join(" ")}`,
        );
      };
    const sandboxConsole = {
      log: mkLog("log"),
      info: mkLog("info"),
      warn: mkLog("warn"),
      error: mkLog("error"),
    };

    // Build the `rokki` runtime object — the tool's entry point into LLM
    // sampling and other host services. Today:
    //   rokki.sample({ messages, model?, max_tokens? })
    //     → calls Anthropic with the caller's key (BYOK) or the server's.
    //       Returns { text, model, usage }.
    const rokki = buildRokkiRuntime(job.env ?? {}, mkLog);

    // Execute the user's module. We expose: input, console, fetch, rokki.
    // It must either export a default function (run/main/handler) or use
    // the last expression as the result.
    const factory = new Function(
      "input",
      "console",
      "fetch",
      "rokki",
      `
      "use strict";
      return (async () => {
        ${code}
        if (typeof run === "function") return await run(input, { rokki });
        if (typeof main === "function") return await main(input, { rokki });
        if (typeof handler === "function") return await handler(input, { rokki });
        return undefined;
      })();
      `,
    );

    const output = await factory(
      job.input,
      sandboxConsole,
      globalThis.fetch,
      rokki,
    );
    parentPort?.postMessage({ kind: "ok", output, logs });
  } catch (e) {
    parentPort?.postMessage({
      kind: "err",
      message: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
    });
  }
}

// ----------------------------------------------------------------------------
// Rokki tool runtime — what a tool sees as `rokki.*`
// ----------------------------------------------------------------------------

interface SampleArgs {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  model?: string;
  max_tokens?: number;
  system?: string;
  temperature?: number;
}

interface SampleResult {
  text: string;
  model: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

function buildRokkiRuntime(
  env: Record<string, string>,
  mkLog: (level: string) => (...args: unknown[]) => void,
) {
  const sampleLog = mkLog("sample");

  async function sample(args: SampleArgs): Promise<SampleResult> {
    if (!args || !Array.isArray(args.messages) || args.messages.length === 0) {
      throw new Error("rokki.sample requires { messages: [...] }");
    }
    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "rokki.sample needs ANTHROPIC_API_KEY — set one under Settings → Provider keys, or contact your admin.",
      );
    }
    const model = args.model ?? "claude-haiku-4-5";
    const maxTokens = Math.min(args.max_tokens ?? 512, 4096);

    sampleLog(`→ ${model} · ${args.messages.length} message(s)`);

    const res = await globalThis.fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: args.system,
        temperature: args.temperature ?? 0.7,
        messages: args.messages,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `rokki.sample failed: HTTP ${res.status} — ${text.slice(0, 300)}`,
      );
    }
    const body = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
      model?: string;
      usage?: { input_tokens: number; output_tokens: number };
    };
    const textOut =
      body.content
        ?.filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("") ?? "";
    sampleLog(
      `← ${body.usage?.output_tokens ?? "?"} out tokens, ${textOut.length} chars`,
    );
    return {
      text: textOut,
      model: body.model ?? model,
      usage: body.usage,
    };
  }

  return {
    sample,
    version: "0.1" as const,
  };
}

function safeStringify(v: unknown, max: number): string {
  try {
    const s = JSON.stringify(v);
    return s.length > max ? s.slice(0, max) + "…" : s;
  } catch {
    return String(v);
  }
}

void run();
