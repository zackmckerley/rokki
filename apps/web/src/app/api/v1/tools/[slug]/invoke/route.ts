import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkQuota, recordQuotaUsage } from "@/lib/quotas";
import { decryptToken } from "@/lib/token-crypto";
import { withObservability } from "@/lib/observability";
import crypto from "node:crypto";

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * POST /api/v1/tools/:slug/invoke  { input, scripts?, entrypoint? }
 *
 * If `scripts` is passed (e.g. from the in-browser test panel), we call the
 * executor with that code instead of the published version. This lets the
 * author try a draft without bumping a version. If omitted, we use the
 * currently published v.
 *
 * Logs to tool_invocations + activity same as the MCP path.
 */
async function handlePost(request: NextRequest, { params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const body = (await request.json().catch(() => ({}))) as {
    input?: unknown;
    scripts?: Record<string, string>;
    entrypoint?: string;
  };

  const { data: toolData } = await supabase
    .from("tools")
    .select(
      "id, slug, name, current_version, timeout_seconds, owner_space_id, visibility, owner_user_id, approval_mode, cost_credits, moderation_status",
    )
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  if (!toolData) return notFound();
  const tool = toolData as {
    id: string;
    slug: string;
    name: string;
    current_version: string;
    timeout_seconds: number;
    owner_space_id: string;
    owner_user_id: string;
    visibility: string;
    approval_mode: "auto" | "one_time" | "per_invocation";
    cost_credits: number;
    moderation_status: "approved" | "pending" | "disabled" | "featured";
  };

  // 0) Moderation gate. Disabled tools are blocked for everyone (the
  // owner can still see them in /tools, but the admin has flagged the
  // executable). Pending tools block non-owners until an admin approves.
  if (tool.moderation_status === "disabled") {
    return NextResponse.json(
      {
        errors: [
          {
            code: "tool_disabled",
            message:
              "This tool was disabled by a platform administrator. Contact support.",
          },
        ],
      },
      { status: 403 },
    );
  }
  if (
    tool.moderation_status === "pending" &&
    tool.owner_user_id !== user.id
  ) {
    return NextResponse.json(
      {
        errors: [
          {
            code: "tool_pending",
            message: "This tool is awaiting admin review.",
          },
        ],
      },
      { status: 403 },
    );
  }

  // 1) Quota gate. Reject upfront so the user sees a clean 429 with a
  // reset time rather than an opaque executor error.
  const quota = await checkQuota(supabase, {
    userId: user.id,
    toolId: tool.id,
    costCredits: tool.cost_credits,
  });
  if (!quota.ok) {
    return NextResponse.json(
      {
        errors: [
          {
            code: "quota_exceeded",
            message: `Out of credits for this tool. Resets ${quota.resets_at ?? "soon"}.`,
          },
        ],
      },
      { status: 429 },
    );
  }

  // 2) Approval gate. Only enforced for non-owners; owners can always run
  // their own tool (for testing/debugging).
  if (
    tool.approval_mode !== "auto" &&
    tool.owner_user_id !== user.id &&
    !body.scripts
  ) {
    // one_time: any prior approved row for (requester, tool) is reusable.
    // per_invocation: always needs a fresh one.
    if (tool.approval_mode === "one_time") {
      const { data: prior } = await supabase
        .from("approvals")
        .select("id, status")
        .eq("type", "tool_access")
        .eq("requester_id", user.id)
        .eq("subject_id", tool.id)
        .eq("status", "approved")
        .limit(1)
        .maybeSingle();
      if (!prior) {
        return await createApproval(
          supabase,
          user.id,
          tool,
          "tool_access",
          inputHintOf(body.input),
        );
      }
    } else {
      return await createApproval(
        supabase,
        user.id,
        tool,
        "tool_invocation",
        inputHintOf(body.input),
      );
    }
  }

  let scripts: Record<string, string> = {};
  let entrypoint = body.entrypoint ?? "index.js";
  let versionId: string | null = null;

  if (body.scripts) {
    // Draft test run — owner only.
    if (tool.owner_user_id !== user.id) return forbidden();
    scripts = body.scripts;
  } else {
    const { data: v } = await supabase
      .from("tool_versions")
      .select("id, entrypoint, scripts")
      .eq("tool_id", tool.id)
      .eq("version", tool.current_version)
      .maybeSingle();
    if (!v) return notFound();
    const ver = v as {
      id: string;
      entrypoint: string;
      scripts: Record<string, string>;
    };
    scripts = ver.scripts;
    entrypoint = ver.entrypoint;
    versionId = ver.id;
  }

  const inputJson = JSON.stringify(body.input ?? {});
  const inputsSha = crypto.createHash("sha256").update(inputJson).digest("hex");

  let invocationId: string | null = null;
  if (versionId) {
    const inv = await supabase
      .from("tool_invocations")
      // @ts-expect-error generated insert collapses to never
      .insert({
        tool_id: tool.id,
        tool_version_id: versionId,
        user_id: user.id,
        status: "running",
        started_at: new Date().toISOString(),
        inputs_sha256: inputsSha,
      })
      .select("id")
      .single();
    invocationId = (inv.data as { id: string } | null)?.id ?? null;
  }

  const EXECUTOR_URL =
    process.env.TOOL_EXECUTOR_URL ?? "http://localhost:3002";
  const EXECUTOR_TOKEN = process.env.TOOL_EXECUTOR_TOKEN ?? "";

  // Decrypt BYOK keys and pass them to the executor as env. Ordered so
  // Anthropic comes first — `rokki.sample` uses it.
  const envForTool = await resolveByokEnv(supabase, user.id);

  const start = Date.now();
  let result: {
    status: "success" | "error" | "timeout";
    output?: unknown;
    logs: string[];
    duration_ms: number;
    error_message?: string;
    error_code?: string;
  };
  try {
    const res = await fetch(`${EXECUTOR_URL}/v1/invoke`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${EXECUTOR_TOKEN}`,
      },
      body: JSON.stringify({
        invocation_id: invocationId ?? crypto.randomUUID(),
        runtime: "node20",
        entrypoint,
        scripts,
        input: body.input ?? {},
        timeout_seconds: tool.timeout_seconds,
        env: envForTool,
      }),
    });
    if (!res.ok) {
      const msg = await res.text();
      result = {
        status: "error",
        logs: [],
        duration_ms: Date.now() - start,
        error_code: "executor_unreachable",
        error_message: `${res.status}: ${msg.slice(0, 200)}`,
      };
    } else {
      result = (await res.json()) as typeof result;
    }
  } catch (e) {
    result = {
      status: "error",
      logs: [],
      duration_ms: Date.now() - start,
      error_code: "executor_unreachable",
      error_message: e instanceof Error ? e.message : "network error",
    };
  }

  if (invocationId) {
    const outputJson = JSON.stringify(result.output ?? null);
    await supabase
      .from("tool_invocations")
      // @ts-expect-error generated update collapses to never
      .update({
        status: result.status,
        completed_at: new Date().toISOString(),
        duration_ms: result.duration_ms,
        output_size_bytes: outputJson
          ? Buffer.byteLength(outputJson, "utf8")
          : null,
        error_code: result.error_code ?? null,
        error_message: result.error_message ?? null,
      })
      .eq("id", invocationId);
  }

  // Record quota usage on success only — we don't charge for failures.
  if (result.status === "success" && tool.cost_credits > 0) {
    await recordQuotaUsage(supabase, {
      userId: user.id,
      toolId: tool.id,
      costCredits: tool.cost_credits,
    });
  }

  return NextResponse.json({ data: result });
}

/**
 * Create a pending approval row and return 202. The requester's UI
 * should poll or listen for the approval to resolve.
 */
async function createApproval(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  tool: {
    id: string;
    slug: string;
    name: string;
    owner_space_id: string;
  },
  type: "tool_access" | "tool_invocation",
  inputHint: string,
) {
  const { data, error } = await supabase
    .from("approvals")
    // @ts-expect-error Phase 0 generics
    .insert({
      type,
      requester_id: userId,
      approver_space_id: tool.owner_space_id,
      subject_type: "tool",
      subject_id: tool.id,
      status: "pending",
      context: { tool_slug: tool.slug, tool_name: tool.name, input_hint: inputHint },
    })
    .select("id")
    .single();
  if (error) {
    return NextResponse.json(
      { errors: [{ code: "approval_failed", message: error.message }] },
      { status: 500 },
    );
  }
  return NextResponse.json(
    {
      data: {
        status: "approval_required",
        approval_id: (data as { id: string }).id,
        message:
          type === "tool_access"
            ? "One-time access approval requested. Ask a space admin to approve."
            : "Per-invocation approval requested.",
      },
    },
    { status: 202 },
  );
}

/**
 * Load and decrypt the user's BYOK keys, shaped as ANTHROPIC_API_KEY etc.
 * for the tool runtime. Failures (missing crypto key, decode error) are
 * swallowed — tools that actually need a key will raise their own error.
 */
async function resolveByokEnv(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<Record<string, string>> {
  const { data } = await supabase
    .from("api_keys")
    .select("provider, ciphertext, iv, tag")
    .eq("user_id", userId);

  const rows = (data ?? []) as Array<{
    provider: string;
    ciphertext: string; // buffer comes through as base64 via REST
    iv: string;
    tag: string;
  }>;

  const env: Record<string, string> = {};
  for (const row of rows) {
    try {
      const plaintext = decryptToken({
        ciphertext: asBase64(row.ciphertext),
        iv: asBase64(row.iv),
        tag: asBase64(row.tag),
      });
      env[providerEnvName(row.provider)] = plaintext;
    } catch {
      // swallow — tool will see the key missing and can fall back
    }
  }
  return env;
}

function asBase64(v: string): string {
  // Supabase returns bytea columns as hex-prefixed strings ("\\x...") via
  // PostgREST. Normalize to base64.
  if (typeof v !== "string") return "";
  if (v.startsWith("\\x")) return Buffer.from(v.slice(2), "hex").toString("base64");
  return v;
}

function providerEnvName(provider: string): string {
  return `${provider.toUpperCase()}_API_KEY`;
}

function inputHintOf(input: unknown): string {
  try {
    const s = JSON.stringify(input ?? {});
    return s.length > 200 ? s.slice(0, 200) + "…" : s;
  } catch {
    return "";
  }
}

function unauth() {
  return NextResponse.json(
    { errors: [{ code: "unauthenticated", message: "Sign in required" }] },
    { status: 401 },
  );
}
function notFound() {
  return NextResponse.json(
    { errors: [{ code: "not_found", message: "Not found" }] },
    { status: 404 },
  );
}
function forbidden() {
  return NextResponse.json(
    { errors: [{ code: "forbidden", message: "Only the owner can test drafts" }] },
    { status: 403 },
  );
}

export const POST = withObservability<Props>(handlePost, "POST /api/v1/tools/:slug/invoke");
