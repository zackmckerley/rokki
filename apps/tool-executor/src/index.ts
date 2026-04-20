/**
 * Rokki tool executor.
 *
 * POST /v1/invoke
 *   Bearer <TOOL_EXECUTOR_TOKEN>
 *   Body: {
 *     invocation_id: string,
 *     runtime: "node20",
 *     entrypoint: string,         // filename present in scripts
 *     scripts: Record<string, string>,
 *     input: unknown,
 *     timeout_seconds?: number,
 *     env?: Record<string, string>  // resolved BYOK keys, reserved for Phase 3b
 *   }
 *   Response: {
 *     status: "success" | "error" | "timeout",
 *     output?: unknown,
 *     logs: string[],
 *     duration_ms: number,
 *     error_code?: string,
 *     error_message?: string
 *   }
 *
 * Current sandbox strategy: spawn a worker_thread, execute the tool inside
 * it, terminate() on timeout. See worker-runner.ts for the security caveat.
 */

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const app = new Hono();

const TOKEN = process.env.TOOL_EXECUTOR_TOKEN ?? "";
const MAX_TIMEOUT = Number(process.env.TOOL_MAX_TIMEOUT_MS ?? 30_000);
const MAX_OUTPUT_BYTES = Number(process.env.TOOL_MAX_OUTPUT_BYTES ?? 262_144);

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve the worker entry. When `tsx watch` runs, this is the .ts file;
// built dist runs the .js. Accept either.
const WORKER_TS = resolve(__dirname, "worker-runner.ts");
const WORKER_JS = resolve(__dirname, "worker-runner.js");
// tsx loads TS workers via its own hook, so we prefer whichever exists.
import { existsSync } from "node:fs";
const WORKER_PATH = existsSync(WORKER_JS) ? WORKER_JS : WORKER_TS;

interface InvokeBody {
  invocation_id?: string;
  runtime?: string;
  entrypoint?: string;
  scripts?: Record<string, string>;
  input?: unknown;
  timeout_seconds?: number;
  env?: Record<string, string>;
}

app.get("/", (c) =>
  c.json({
    service: "rokki-tool-executor",
    version: "0.1.0",
    worker: WORKER_PATH,
    uptime_s: Math.round(process.uptime()),
  }),
);
app.get("/v1/health", (c) =>
  c.json({ ok: true, time: new Date().toISOString() }),
);

app.post("/v1/invoke", async (c) => {
  if (!TOKEN) {
    return c.json({ error: "server misconfigured: TOOL_EXECUTOR_TOKEN unset" }, 500);
  }
  const auth = c.req.header("Authorization") ?? "";
  const [scheme, presented] = auth.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || presented !== TOKEN) {
    return c.json({ error: "unauthorized" }, 401);
  }

  let body: InvokeBody;
  try {
    body = (await c.req.json()) as InvokeBody;
  } catch {
    return c.json({ error: "invalid json" }, 400);
  }

  if (!body.entrypoint || !body.scripts) {
    return c.json({ error: "entrypoint and scripts are required" }, 400);
  }
  const runtime = body.runtime ?? "node20";
  if (runtime !== "node20") {
    return c.json({ error: `unsupported runtime: ${runtime}` }, 400);
  }

  const timeoutMs = Math.min(
    MAX_TIMEOUT,
    Math.max(1_000, (body.timeout_seconds ?? 10) * 1000),
  );

  const startedAt = Date.now();
  try {
    // Merge caller-provided BYOK keys with executor-level fallbacks. Never
    // include the whole host env — only the keys we've vetted.
    const env: Record<string, string> = {};
    const FORWARD = [
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
      "GOOGLE_API_KEY",
      "MISTRAL_API_KEY",
      "COHERE_API_KEY",
    ];
    for (const k of FORWARD) {
      if (process.env[k]) env[k] = process.env[k]!;
    }
    if (body.env) Object.assign(env, body.env);

    const result = await runInWorker(
      {
        entrypoint: body.entrypoint,
        scripts: body.scripts,
        input: body.input,
        env,
      },
      timeoutMs,
    );
    const duration_ms = Date.now() - startedAt;

    if (result.kind === "timeout") {
      return c.json({
        status: "timeout" as const,
        logs: result.logs,
        duration_ms,
        error_code: "timeout",
        error_message: `tool exceeded ${timeoutMs}ms`,
      });
    }
    if (result.kind === "err") {
      return c.json({
        status: "error" as const,
        logs: result.logs,
        duration_ms,
        error_code: "tool_error",
        error_message: result.message,
      });
    }

    // Enforce output size cap.
    let outputJson = safeJson(result.output);
    let output_truncated = false;
    if (outputJson.length > MAX_OUTPUT_BYTES) {
      outputJson = outputJson.slice(0, MAX_OUTPUT_BYTES);
      output_truncated = true;
    }

    return c.json({
      status: "success" as const,
      output: output_truncated ? `[truncated] ${outputJson}` : result.output,
      logs: result.logs,
      duration_ms,
      output_truncated,
    });
  } catch (e) {
    return c.json(
      {
        status: "error" as const,
        logs: [],
        duration_ms: Date.now() - startedAt,
        error_code: "internal_error",
        error_message: e instanceof Error ? e.message : "internal error",
      },
      500,
    );
  }
});

type WorkerResult =
  | { kind: "ok"; output: unknown; logs: string[] }
  | { kind: "err"; message: string; logs: string[] }
  | { kind: "timeout"; logs: string[] };

async function runInWorker(
  job: {
    entrypoint: string;
    scripts: Record<string, string>;
    input: unknown;
    env: Record<string, string>;
  },
  timeoutMs: number,
): Promise<WorkerResult> {
  return new Promise((resolve) => {
    const worker = new Worker(WORKER_PATH, {
      workerData: job,
      // tsx's loader hook applies automatically when we're already running
      // under tsx; no additional config needed.
      execArgv: WORKER_PATH.endsWith(".ts") ? ["--import", "tsx"] : [],
    });
    let settled = false;
    const logs: string[] = [];
    const kill = (reason: WorkerResult) => {
      if (settled) return;
      settled = true;
      void worker.terminate();
      resolve(reason);
    };

    const timer = setTimeout(
      () => kill({ kind: "timeout", logs }),
      timeoutMs,
    );

    worker.on("message", (msg: unknown) => {
      const m = msg as {
        kind: "ok" | "err";
        output?: unknown;
        logs?: string[];
        message?: string;
      };
      clearTimeout(timer);
      if (Array.isArray(m.logs)) logs.push(...m.logs);
      if (m.kind === "ok") {
        kill({ kind: "ok", output: m.output, logs });
      } else {
        kill({ kind: "err", message: m.message ?? "worker error", logs });
      }
    });
    worker.on("error", (err) => {
      clearTimeout(timer);
      kill({ kind: "err", message: err.message, logs });
    });
    worker.on("exit", (code) => {
      clearTimeout(timer);
      if (!settled) kill({ kind: "err", message: `worker exited: ${code}`, logs });
    });
  });
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

const port = Number(process.env.PORT ?? 3002);
console.log(
  `[rokki-tool-executor] listening on :${port} (worker: ${WORKER_PATH})`,
);
serve({ fetch: app.fetch, port });
