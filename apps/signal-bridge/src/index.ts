import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

/**
 * Rokki Signal bridge — Phase 0 skeleton. Wraps signal-cli to:
 *   - link a user's Signal account as a secondary device,
 *   - receive their messages into Supabase (signal_threads / signal_messages),
 *   - send on their behalf.
 *
 * Deploys standalone on an always-on host (Fly.io), separate from the Vercel
 * web app — see docs/SIGNAL_INTEGRATION.md and ./README.md. The structure,
 * auth, and DB writes are real; the exact signal-cli JSON envelope mapping in
 * `toInbound` is best-effort and gets validated against a live signal-cli as
 * the Phase-0 acceptance step.
 */

const PORT = Number(process.env.PORT ?? 8080);
const BRIDGE_SECRET = process.env.BRIDGE_SECRET ?? "";
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const SIGNAL_CLI = process.env.SIGNAL_CLI_PATH ?? "signal-cli";

// JVM tuning for signal-cli, inherited by every spawn:
//  - preferIPv4Stack: Fly resolves chat.signal.org to IPv6 too, and signal-cli
//    tries IPv6 first and stalls ~20s before falling back — forcing IPv4 makes
//    `link` return in ~5s instead of ~25s (the cause of the timeout).
//  - egd=/dev/./urandom: seed from non-blocking urandom so key generation never
//    blocks on a low-entropy container VM.
process.env.JAVA_TOOL_OPTIONS = [
  process.env.JAVA_TOOL_OPTIONS,
  "-Djava.net.preferIPv4Stack=true",
  "-Djava.security.egd=file:/dev/./urandom",
]
  .filter(Boolean)
  .join(" ");

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Run signal-cli to completion and resolve its stdout. */
function runSignalCli(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(SIGNAL_CLI, args);
    let out = "";
    let err = "";
    proc.stdout.on("data", (d: Buffer) => {
      out += d.toString();
    });
    proc.stderr.on("data", (d: Buffer) => {
      err += d.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(`signal-cli ${code}: ${err}`)),
    );
  });
}

/**
 * Start `signal-cli link`: resolve with the `sgnl://linkdevice` URI as soon as
 * it's printed (for the app to render as a QR), and keep the process alive
 * until the phone completes the link — then flip the account to active.
 */
function startLink(userId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    console.log(`[link] spawn signal-cli for ${userId}`);
    const proc = spawn(SIGNAL_CLI, ["link", "-n", "Rokki"]);
    let gotUri = false;
    // Watch both streams: the URI prints to stdout, but logs go to stderr —
    // capturing both makes failures legible and is robust if Signal moves it.
    const scan = (d: Buffer, stream: "out" | "err") => {
      const text = d.toString();
      console.log(`[link] ${stream} +${Date.now() - t0}ms: ${text.slice(0, 240)}`);
      const m = text.match(/sgnl:\/\/linkdevice\S+/);
      if (m && !gotUri) {
        gotUri = true;
        console.log(`[link] got URI for ${userId} after ${Date.now() - t0}ms`);
        resolve(m[0]);
      }
    };
    proc.stdout.on("data", (d: Buffer) => scan(d, "out"));
    proc.stderr.on("data", (d: Buffer) => scan(d, "err"));
    proc.on("error", (e) => {
      console.log(`[link] spawn error: ${String(e)}`);
      if (!gotUri) reject(e);
    });
    proc.on("close", (code) => {
      console.log(`[link] closed code=${code} gotUri=${gotUri} after ${Date.now() - t0}ms`);
      if (code === 0) {
        void db
          .from("signal_accounts")
          .update({ status: "active", linked_at: new Date().toISOString() })
          .eq("user_id", userId);
      } else if (!gotUri) {
        reject(new Error(`link ended (${code}) before emitting a URI`));
      }
    });
  });
}

interface InboundMessage {
  userId: string;
  signalId: string;
  kind: "direct" | "group";
  sender: string;
  body: string;
  externalId: string;
  sentAt: string;
}

/** Upsert the thread and insert the inbound message. */
async function writeInbound(m: InboundMessage): Promise<void> {
  const { data: thread } = await db
    .from("signal_threads")
    .upsert(
      {
        user_id: m.userId,
        signal_id: m.signalId,
        kind: m.kind,
        last_message_at: m.sentAt,
      },
      { onConflict: "user_id,signal_id" },
    )
    .select("id")
    .single();
  const threadId = (thread as { id: string } | null)?.id;
  if (!threadId) return;
  await db.from("signal_messages").insert({
    thread_id: threadId,
    user_id: m.userId,
    external_id: m.externalId,
    direction: "in",
    sender: m.sender,
    body: m.body,
    sent_at: m.sentAt,
  });
}

/** Map a signal-cli JSON receive event → InboundMessage (best-effort). */
function toInbound(userId: string, evt: unknown): InboundMessage | null {
  if (typeof evt !== "object" || evt === null) return null;
  const env = (evt as { envelope?: unknown }).envelope;
  if (typeof env !== "object" || env === null) return null;
  const e = env as {
    source?: string;
    timestamp?: number;
    dataMessage?: { message?: string; groupInfo?: { groupId?: string } };
  };
  const data = e.dataMessage;
  if (!data || typeof data.message !== "string") return null;
  const groupId = data.groupInfo?.groupId;
  const ts = typeof e.timestamp === "number" ? e.timestamp : Date.now();
  return {
    userId,
    signalId: groupId ?? e.source ?? "unknown",
    kind: groupId ? "group" : "direct",
    sender: e.source ?? "unknown",
    body: data.message,
    externalId: String(ts),
    sentAt: new Date(ts).toISOString(),
  };
}

/** Long-running receiver for one linked account. */
function startReceiver(userId: string, number: string): void {
  const proc = spawn(SIGNAL_CLI, ["-a", number, "-o", "json", "receive", "--timeout", "-1"]);
  proc.stdout.on("data", (d: Buffer) => {
    for (const line of d.toString().split("\n")) {
      if (!line.trim()) continue;
      try {
        const inbound = toInbound(userId, JSON.parse(line) as unknown);
        if (inbound) void writeInbound(inbound);
      } catch {
        // ignore non-JSON / unparseable lines
      }
    }
  });
  proc.on("error", () => {
    // a real impl backs off + restarts; left to Phase-0 hardening
  });
}

/** Start receivers for every already-active account on boot. */
async function startReceiveLoops(): Promise<void> {
  const { data } = await db
    .from("signal_accounts")
    .select("user_id, signal_number")
    .eq("status", "active");
  for (const a of (data ?? []) as { user_id: string; signal_number: string | null }[]) {
    if (a.signal_number) startReceiver(a.user_id, a.signal_number);
  }
}

const app = new Hono();

app.use("*", async (c, next) => {
  if (c.req.path === "/health") return next();
  if (!BRIDGE_SECRET || c.req.header("x-bridge-secret") !== BRIDGE_SECRET) {
    return c.json({ error: "unauthorized" }, 401);
  }
  return next();
});

app.get("/health", (c) => c.json({ ok: true, service: "signal-bridge" }));

app.post("/accounts/:userId/link", async (c) => {
  const userId = c.req.param("userId");
  try {
    await db.from("signal_accounts").upsert({ user_id: userId, status: "linking" });
    const uri = await startLink(userId);
    return c.json({ uri });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

app.post("/accounts/:userId/send", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Partial<{
    signalNumber: string;
    signalId: string;
    kind: "direct" | "group";
    text: string;
  }>;
  if (!body.signalNumber || !body.signalId || !body.text) {
    return c.json({ error: "signalNumber, signalId and text are required" }, 400);
  }
  const target = body.kind === "group" ? ["-g", body.signalId] : [body.signalId];
  try {
    await runSignalCli(["-a", body.signalNumber, "send", "-m", body.text, ...target]);
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

void startReceiveLoops();
serve({ fetch: app.fetch, port: PORT });
console.log(`signal-bridge listening on :${PORT}`);
