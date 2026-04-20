/**
 * HTTP client for the Rokki tool-executor service. Kept small — one call.
 */

export interface InvokeRequest {
  invocation_id: string;
  runtime: string;
  entrypoint: string;
  scripts: Record<string, string>;
  input: unknown;
  timeout_seconds?: number;
  env?: Record<string, string>;
}

export interface InvokeResponse {
  status: "success" | "error" | "timeout";
  output?: unknown;
  logs: string[];
  duration_ms: number;
  output_truncated?: boolean;
  error_code?: string;
  error_message?: string;
}

const EXECUTOR_URL =
  process.env.TOOL_EXECUTOR_URL ?? "http://localhost:3002";
const EXECUTOR_TOKEN = process.env.TOOL_EXECUTOR_TOKEN ?? "";

export async function invokeTool(
  req: InvokeRequest,
): Promise<InvokeResponse> {
  const res = await fetch(`${EXECUTOR_URL}/v1/invoke`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${EXECUTOR_TOKEN}`,
    },
    body: JSON.stringify(req),
  });
  if (!res.ok && res.status !== 200) {
    let msg = `executor http ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) msg = body.error;
    } catch {
      /* ignore */
    }
    return {
      status: "error",
      logs: [],
      duration_ms: 0,
      error_code: "executor_unreachable",
      error_message: msg,
    };
  }
  return (await res.json()) as InvokeResponse;
}
