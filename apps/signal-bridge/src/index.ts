import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

/**
 * Rokki Signal bridge. Wraps signal-cli to:
 *   - link a user's Signal account as a secondary device,
 *   - receive their messages into Supabase (signal_threads / signal_messages),
 *   - send on their behalf.
 *
 * Deploys standalone on an always-on host (Fly.io), separate from the Vercel
 * web app — see apps/signal-bridge/README.md. Deploys automatically on push to
 * main via .github/workflows/deploy-signal-bridge.yml.
 *
 * NOTE on Signal history: a linked (secondary) device only receives messages
 * sent FROM LINK TIME FORWARD — Signal never back-fills history to a new
 * device. So Rokki shows go-forward conversations, not a user's archive.
 */

// JVM tuning for signal-cli, inherited by every spawn:
//  - preferIPv4Stack: Fly resolves chat.signal.org to IPv6 too, and signal-cli
//    tries IPv6 first and stalls ~20s before falling back — forcing IPv4 makes
//    `link` return in ~5s instead of ~25s.
//  - egd=/dev/./urandom: seed from non-blocking urandom so key generation never
//    blocks on a low-entropy container VM.
process.env.JAVA_TOOL_OPTIONS = [
  process.env.JAVA_TOOL_OPTIONS,
  "-Djava.net.preferIPv4Stack=true",
  "-Djava.security.egd=file:/dev/./urandom",
]
  .filter(Boolean)
  .join(" ");

const PORT = Number(process.env.PORT ?? 8080);
const BRIDGE_SECRET = process.env.BRIDGE_SECRET ?? "";
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const SIGNAL_CLI = process.env.SIGNAL_CLI_PATH ?? "signal-cli";

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

/** Every account number signal-cli has linked locally (in the data volume). */
async function listAccountNumbers(): Promise<string[]> {
  try {
    const out = await runSignalCli(["-o", "json", "listAccounts"]);
    const arr = JSON.parse(out) as Array<{ number?: string }>;
    return arr.map((a) => a.number).filter((n): n is string => Boolean(n));
  } catch {
    return [];
  }
}

// ── inbound parsing ─────────────────────────────────────────────────────────

interface RawGroup {
  groupId?: string;
}
interface RawDataMessage {
  message?: string;
  timestamp?: number;
  groupInfo?: RawGroup;
  groupV2?: { id?: string };
}
interface RawSentMessage {
  message?: string;
  timestamp?: number;
  destination?: string;
  destinationNumber?: string;
  destinationUuid?: string;
  groupInfo?: RawGroup;
  groupV2?: { id?: string };
}
interface RawEnvelope {
  source?: string;
  sourceNumber?: string;
  sourceUuid?: string;
  timestamp?: number;
  dataMessage?: RawDataMessage;
  syncMessage?: { sentMessage?: RawSentMessage };
}

interface InboundMessage {
  userId: string;
  signalId: string;
  kind: "direct" | "group";
  direction: "in" | "out";
  sender: string | null;
  body: string;
  externalId: string;
  sentAt: string;
}

const groupOf = (m: { groupInfo?: RawGroup; groupV2?: { id?: string } }): string | undefined =>
  m.groupInfo?.groupId ?? m.groupV2?.id;

const iso = (ts: number | undefined, fallback: number): string =>
  new Date(typeof ts === "number" ? ts : fallback).toISOString();

/**
 * Map a signal-cli JSON receive event → InboundMessage. Handles three shapes:
 *   - dataMessage          → an INCOMING message (direction "in")
 *   - syncMessage.sentMessage → a message the user sent from their PHONE or
 *     another linked device (direction "out"), so the thread mirrors what they
 *     see in the Signal app
 * Receipts, typing, reactions, and empty/control envelopes return null.
 */
function toInbound(userId: string, evt: unknown): InboundMessage | null {
  if (typeof evt !== "object" || evt === null) return null;
  const env = (evt as { envelope?: RawEnvelope }).envelope;
  if (!env || typeof env !== "object") return null;
  const now = Date.now();
  const source = env.sourceNumber ?? env.source ?? env.sourceUuid ?? "unknown";

  const dm = env.dataMessage;
  if (dm && typeof dm.message === "string" && dm.message.length > 0) {
    const groupId = groupOf(dm);
    const ts = dm.timestamp ?? env.timestamp;
    return {
      userId,
      signalId: groupId ?? source,
      kind: groupId ? "group" : "direct",
      direction: "in",
      sender: source,
      body: dm.message,
      externalId: String(ts ?? now),
      sentAt: iso(ts, now),
    };
  }

  const sent = env.syncMessage?.sentMessage;
  if (sent && typeof sent.message === "string" && sent.message.length > 0) {
    const groupId = groupOf(sent);
    const dest = sent.destinationNumber ?? sent.destination ?? sent.destinationUuid;
    const signalId = groupId ?? dest;
    if (!signalId) return null;
    return {
      userId,
      signalId,
      kind: groupId ? "group" : "direct",
      direction: "out",
      sender: null,
      body: sent.message,
      externalId: String(sent.timestamp ?? env.timestamp ?? now),
      sentAt: iso(sent.timestamp ?? env.timestamp, now),
    };
  }

  return null;
}

/** Upsert the thread and insert the message (idempotent on thread+external_id). */
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

  // De-dupe: signal-cli can re-deliver on reconnect, and an outbound send +
  // its sync echo can collide. external_id is the signal-cli message timestamp.
  const { data: existing } = await db
    .from("signal_messages")
    .select("id")
    .eq("thread_id", threadId)
    .eq("external_id", m.externalId)
    .eq("direction", m.direction)
    .maybeSingle();
  if (existing) return;

  await db.from("signal_messages").insert({
    thread_id: threadId,
    user_id: m.userId,
    external_id: m.externalId,
    direction: m.direction,
    sender: m.sender,
    body: m.body,
    sent_at: m.sentAt,
  });
}

// ── receivers ────────────────────────────────────────────────────────────────

/** Numbers with a running (or scheduled) receive loop — avoids duplicates. */
const receiving = new Set<string>();

/** Long-running receiver for one linked account; auto-restarts on exit. */
function startReceiver(userId: string, number: string): void {
  if (receiving.has(number)) return;
  receiving.add(number);

  const spawnLoop = (): void => {
    const proc = spawn(SIGNAL_CLI, [
      "-a",
      number,
      "-o",
      "json",
      "receive",
      "--timeout",
      "-1",
    ]);
    let restarted = false;
    const restart = (): void => {
      if (restarted) return;
      restarted = true;
      // Back off a few seconds so a tight crash loop can't hammer the CPU or
      // Signal's servers, then re-establish the receive stream.
      setTimeout(spawnLoop, 5_000);
    };
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
      /* 'close' fires next and handles the restart */
    });
    proc.on("close", restart);
  };

  spawnLoop();
  console.log(`[receiver] started for ${number}`);
}

/**
 * On boot, start a receiver for every active account. Back-fills the stored
 * signal_number for accounts that linked before number-capture existed: if an
 * active account has no number and signal-cli has exactly one linked account,
 * adopt it — so users don't have to re-link.
 */
async function startReceiveLoops(): Promise<void> {
  const { data } = await db
    .from("signal_accounts")
    .select("user_id, signal_number")
    .eq("status", "active");
  const accounts = (data ?? []) as { user_id: string; signal_number: string | null }[];

  const missing = accounts.filter((a) => !a.signal_number);
  let linkedNumbers: string[] = [];
  if (missing.length > 0) linkedNumbers = await listAccountNumbers();

  for (const a of accounts) {
    let number = a.signal_number;
    if (!number && linkedNumbers.length === 1) {
      number = linkedNumbers[0];
      await db
        .from("signal_accounts")
        .update({ signal_number: number })
        .eq("user_id", a.user_id);
      console.log(`[boot] back-filled signal_number for ${a.user_id}`);
    }
    if (number) startReceiver(a.user_id, number);
  }
}

/**
 * Start `signal-cli link`: resolve with the `sgnl://linkdevice` URI as soon as
 * it's printed (for the app to render as a QR), keep the process alive until
 * the phone completes the link, then store the number + flip to active + start
 * receiving.
 */
function startLink(userId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(SIGNAL_CLI, ["link", "-n", "Rokki"]);
    const t0 = Date.now();
    let gotUri = false;
    let number: string | null = null;

    // Watch both streams: the URI prints to stdout, logs to stderr. Capturing
    // both makes failures legible and lets us grab the linked number
    // ("Associated with: +1…") to start receiving immediately.
    const scan = (d: Buffer, stream: "out" | "err"): void => {
      const text = d.toString();
      console.log(`[link] ${stream} +${Date.now() - t0}ms: ${text.slice(0, 240)}`);
      const uri = text.match(/sgnl:\/\/linkdevice\S+/);
      if (uri && !gotUri) {
        gotUri = true;
        resolve(uri[0]);
      }
      const assoc = text.match(/Associated with:\s*(\+\d+)/);
      if (assoc) number = assoc[1];
    };
    proc.stdout.on("data", (d: Buffer) => scan(d, "out"));
    proc.stderr.on("data", (d: Buffer) => scan(d, "err"));
    proc.on("error", (e) => {
      if (!gotUri) reject(e);
    });
    proc.on("close", (code) => {
      void (async () => {
        if (code !== 0) {
          if (!gotUri) reject(new Error(`link ended (${code}) before emitting a URI`));
          return;
        }
        // Fallback: if the number didn't appear in the output, ask signal-cli.
        if (!number) {
          const nums = await listAccountNumbers();
          if (nums.length === 1) number = nums[0];
        }
        // NOTE: supabase-js queries are lazy — `void db…update()` never runs.
        // `.then()` executes it so the link doesn't get stuck on "linking".
        db.from("signal_accounts")
          .update({
            status: "active",
            signal_number: number,
            linked_at: new Date().toISOString(),
          })
          .eq("user_id", userId)
          .then(({ error }) =>
            console.log(
              `[link] active for ${userId}${error ? ` — error: ${error.message}` : ""}`,
            ),
          );
        if (number) startReceiver(userId, number);
      })();
    });
  });
}

// ── HTTP API ─────────────────────────────────────────────────────────────────

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
  const userId = c.req.param("userId");
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
    // Record the outbound message so it appears in the thread immediately
    // (sending from this device doesn't sync back to itself).
    await writeInbound({
      userId,
      signalId: body.signalId,
      kind: body.kind === "group" ? "group" : "direct",
      direction: "out",
      sender: null,
      body: body.text,
      externalId: String(Date.now()),
      sentAt: new Date().toISOString(),
    });
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

void startReceiveLoops();
serve({ fetch: app.fetch, port: PORT });
console.log(`signal-bridge listening on :${PORT}`);
