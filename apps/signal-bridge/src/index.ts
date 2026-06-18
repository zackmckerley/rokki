import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { spawn, type ChildProcess } from "node:child_process";
import { connect, type Socket } from "node:net";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

/**
 * Rokki Signal bridge. Wraps signal-cli to link a user's account, receive
 * their messages into Supabase, and send on their behalf.
 *
 * Architecture: ONE long-lived `signal-cli daemon` (JSON-RPC over a local TCP
 * socket) handles BOTH send and receive. Sends are a socket round-trip (~ms)
 * instead of a per-call JVM cold-start (~5–15s) — that's what makes sending
 * feel instant. `link` is the only thing that still spawns signal-cli directly
 * (it's interactive provisioning); after a successful link we bounce the daemon
 * so it picks up the new account.
 *
 * NOTE on history: a linked (secondary) device only receives messages sent
 * FROM LINK TIME FORWARD — Signal never back-fills history to a new device.
 */

// JVM tuning, inherited by every signal-cli spawn (link + daemon):
//  - preferIPv4Stack: Fly's IPv6 stalls signal-cli ~20s before falling back.
//  - egd=urandom: don't block key-gen on a low-entropy container.
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
// signal-cli auto-downloads received attachments here; the Fly volume is mounted
// at this path (see fly.toml [mounts]).
const SIGNAL_DATA_HOME =
  process.env.SIGNAL_DATA_HOME ?? "/root/.local/share/signal-cli";
const MEDIA_BUCKET = process.env.SIGNAL_MEDIA_BUCKET ?? "signal-media";
const RPC_HOST = "127.0.0.1";
const RPC_PORT = Number(process.env.SIGNAL_RPC_PORT ?? 7583);

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Run signal-cli to completion and resolve its stdout (for link + listAccounts). */
function runSignalCli(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(SIGNAL_CLI, args);
    let out = "";
    let err = "";
    proc.stdout.on("data", (d: Buffer) => (out += d.toString()));
    proc.stderr.on("data", (d: Buffer) => (err += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(`signal-cli ${code}: ${err}`)),
    );
  });
}

async function listAccountNumbers(): Promise<string[]> {
  try {
    const out = await runSignalCli(["-o", "json", "listAccounts"]);
    const arr = JSON.parse(out) as Array<{ number?: string }>;
    return arr.map((a) => a.number).filter((n): n is string => Boolean(n));
  } catch {
    return [];
  }
}

// ── account → user routing (receive notifications carry the account number) ──

const accountToUser = new Map<string, string>();

async function refreshAccountMap(): Promise<void> {
  const { data } = await db
    .from("signal_accounts")
    .select("user_id, signal_number")
    .eq("status", "active");
  const rows = (data ?? []) as { user_id: string; signal_number: string | null }[];

  // Back-fill: an account linked before number-capture has a null number. If
  // signal-cli has exactly one linked account, adopt it (so a single-user
  // bridge "just works" without a re-link).
  const missing = rows.filter((r) => !r.signal_number);
  if (missing.length > 0) {
    const nums = await listAccountNumbers();
    if (nums.length === 1) {
      for (const r of missing) {
        r.signal_number = nums[0];
        await db
          .from("signal_accounts")
          .update({ signal_number: nums[0] })
          .eq("user_id", r.user_id);
        console.log(`[map] back-filled signal_number for ${r.user_id}`);
      }
    }
  }

  accountToUser.clear();
  for (const r of rows) if (r.signal_number) accountToUser.set(r.signal_number, r.user_id);
  console.log(`[map] ${accountToUser.size} active account(s)`);
}

// ── inbound parsing ───────────────────────────────────────────────────────────

interface RawGroup {
  groupId?: string;
}
interface RawAttachment {
  id?: string;
  contentType?: string;
  filename?: string;
  size?: number;
}
interface RawDataMessage {
  message?: string;
  timestamp?: number;
  groupInfo?: RawGroup;
  groupV2?: { id?: string };
  attachments?: RawAttachment[];
}
interface RawSentMessage {
  message?: string;
  timestamp?: number;
  destination?: string;
  destinationNumber?: string;
  destinationUuid?: string;
  groupInfo?: RawGroup;
  groupV2?: { id?: string };
  attachments?: RawAttachment[];
}
interface RawEnvelope {
  source?: string;
  sourceNumber?: string;
  sourceUuid?: string;
  timestamp?: number;
  dataMessage?: RawDataMessage;
  syncMessage?: { sentMessage?: RawSentMessage };
  receiptMessage?: {
    when?: number;
    isDelivery?: boolean;
    isRead?: boolean;
    isViewed?: boolean;
    timestamps?: number[];
  };
}

type MsgStatus = "sending" | "sent" | "delivered" | "read" | "failed";
/** Only ever advance a message's status forward — a late delivery receipt must
 *  not downgrade a row already marked read. `failed` is terminal/separate. */
const STATUS_RANK: Record<MsgStatus, number> = {
  sending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 0,
};

interface StoredAttachment {
  storage_key: string;
  content_type: string | null;
  filename: string | null;
  size: number | null;
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
  status: MsgStatus;
  /** Already-uploaded attachment metadata (outbound sends). */
  attachments?: StoredAttachment[];
  /** signal-cli attachment refs to download from disk + upload (inbound). */
  signalAttachments?: RawAttachment[];
}

const groupOf = (m: { groupInfo?: RawGroup; groupV2?: { id?: string } }): string | undefined =>
  m.groupInfo?.groupId ?? m.groupV2?.id;

const iso = (ts: number | undefined, fallback: number): string =>
  new Date(typeof ts === "number" ? ts : fallback).toISOString();

/**
 * Map a signal-cli receive payload (`{ envelope, account }`) → InboundMessage.
 * Handles incoming dataMessages ("in") and the user's own sent-elsewhere
 * messages via syncMessage.sentMessage ("out"). Receipts/typing → null.
 */
function toInbound(userId: string, evt: unknown): InboundMessage | null {
  if (typeof evt !== "object" || evt === null) return null;
  const env = (evt as { envelope?: RawEnvelope }).envelope;
  if (!env || typeof env !== "object") return null;
  const now = Date.now();
  const source = env.sourceNumber ?? env.source ?? env.sourceUuid ?? "unknown";

  const dm = env.dataMessage;
  const dmHasContent =
    !!dm &&
    ((typeof dm.message === "string" && dm.message.length > 0) ||
      (dm.attachments?.length ?? 0) > 0);
  if (dm && dmHasContent) {
    const groupId = groupOf(dm);
    const ts = dm.timestamp ?? env.timestamp;
    return {
      userId,
      signalId: groupId ?? source,
      kind: groupId ? "group" : "direct",
      direction: "in",
      sender: source,
      body: dm.message ?? "",
      externalId: String(ts ?? now),
      sentAt: iso(ts, now),
      status: "sent",
      signalAttachments: dm.attachments,
    };
  }

  const sent = env.syncMessage?.sentMessage;
  const sentHasContent =
    !!sent &&
    ((typeof sent.message === "string" && sent.message.length > 0) ||
      (sent.attachments?.length ?? 0) > 0);
  if (sent && sentHasContent) {
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
      body: sent.message ?? "",
      externalId: String(sent.timestamp ?? env.timestamp ?? now),
      sentAt: iso(sent.timestamp ?? env.timestamp, now),
      status: "sent",
      signalAttachments: sent.attachments,
    };
  }

  return null;
}

/** Upsert the thread and insert the message (idempotent on thread+external_id). */
async function writeInbound(m: InboundMessage): Promise<void> {
  const { data: thread } = await db
    .from("signal_threads")
    .upsert(
      { user_id: m.userId, signal_id: m.signalId, kind: m.kind, last_message_at: m.sentAt },
      { onConflict: "user_id,signal_id" },
    )
    .select("id")
    .single();
  const threadId = (thread as { id: string } | null)?.id;
  if (!threadId) return;

  const { data: existing } = await db
    .from("signal_messages")
    .select("id")
    .eq("thread_id", threadId)
    .eq("external_id", m.externalId)
    .eq("direction", m.direction)
    .maybeSingle();
  if (existing) return;

  // Outbound sends arrive with attachments already uploaded; inbound receives
  // carry signal-cli refs we read off disk + upload now.
  const attachments =
    m.attachments ??
    (m.signalAttachments?.length
      ? await uploadSignalAttachments(m.userId, threadId, m.signalAttachments)
      : []);

  await db.from("signal_messages").insert({
    thread_id: threadId,
    user_id: m.userId,
    external_id: m.externalId,
    direction: m.direction,
    sender: m.sender,
    body: m.body,
    sent_at: m.sentAt,
    status: m.status,
    attachments,
  });
}

/** Read each received attachment off signal-cli's disk + upload to storage. */
async function uploadSignalAttachments(
  userId: string,
  threadId: string,
  atts: RawAttachment[],
): Promise<StoredAttachment[]> {
  const out: StoredAttachment[] = [];
  for (const a of atts) {
    if (!a.id) continue;
    try {
      const buf = await readFile(join(SIGNAL_DATA_HOME, "attachments", a.id));
      const key = `${userId}/${threadId}/${a.id}`;
      const { error } = await db.storage.from(MEDIA_BUCKET).upload(key, buf, {
        contentType: a.contentType ?? "application/octet-stream",
        upsert: true,
      });
      if (error) {
        console.log(`[media] upload failed ${a.id}: ${error.message}`);
        continue;
      }
      out.push({
        storage_key: key,
        content_type: a.contentType ?? null,
        filename: a.filename ?? null,
        size: a.size ?? buf.length,
      });
    } catch (e) {
      console.log(`[media] read failed ${a.id}: ${String(e)}`);
    }
  }
  return out;
}

/**
 * A delivery/read receipt arrived for one or more outbound messages (keyed by
 * the original send timestamp). Advance their status forward only.
 */
async function applyReceipt(
  userId: string,
  r: { isDelivery?: boolean; isRead?: boolean; isViewed?: boolean; timestamps?: number[] },
): Promise<void> {
  const target: MsgStatus | null =
    r.isRead || r.isViewed ? "read" : r.isDelivery ? "delivered" : null;
  if (!target || !r.timestamps?.length) return;
  const ids = r.timestamps.map(String);
  const { data } = await db
    .from("signal_messages")
    .select("id, status")
    .eq("user_id", userId)
    .eq("direction", "out")
    .in("external_id", ids);
  for (const m of (data ?? []) as { id: string; status: MsgStatus }[]) {
    if (STATUS_RANK[target] > (STATUS_RANK[m.status] ?? 0)) {
      await db
        .from("signal_messages")
        .update({ status: target, status_at: new Date().toISOString() })
        .eq("id", m.id);
    }
  }
}

// ── contact / group directory sync ────────────────────────────────────────────

interface RawContact {
  number?: string;
  uuid?: string;
  name?: string;
  profileName?: string;
  profile?: { givenName?: string; familyName?: string };
}
interface RawGroupInfo {
  id?: string;
  name?: string;
}

function contactName(c: RawContact): string | null {
  const profile = [c.profile?.givenName, c.profile?.familyName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return c.name?.trim() || c.profileName?.trim() || profile || null;
}

/**
 * Pull the account's Signal contacts + groups into signal_contacts (so Rokki
 * can show names + offer a "new message" picker) and back-fill thread titles
 * with the resolved names. Signal is the source of truth; this is a refresh.
 */
async function syncContacts(userId: string, number: string): Promise<void> {
  try {
    const [contacts, groups] = await Promise.all([
      rpcCall<RawContact[]>("listContacts", { account: number }).catch(() => []),
      rpcCall<RawGroupInfo[]>("listGroups", { account: number }).catch(() => []),
    ]);
    const now = new Date().toISOString();
    const rows: {
      user_id: string;
      signal_id: string;
      kind: "direct" | "group";
      name: string | null;
      updated_at: string;
    }[] = [];
    for (const c of contacts ?? []) {
      const id = c.number ?? c.uuid;
      if (!id) continue;
      rows.push({ user_id: userId, signal_id: id, kind: "direct", name: contactName(c), updated_at: now });
    }
    for (const g of groups ?? []) {
      if (!g.id) continue;
      rows.push({ user_id: userId, signal_id: g.id, kind: "group", name: g.name?.trim() || null, updated_at: now });
    }
    if (rows.length === 0) return;
    await db.from("signal_contacts").upsert(rows, { onConflict: "user_id,signal_id" });

    // Back-fill titles on existing threads that now have a name.
    const nameById = new Map(rows.map((r) => [r.signal_id, r.name]));
    const { data: threads } = await db
      .from("signal_threads")
      .select("id, signal_id, title")
      .eq("user_id", userId);
    for (const t of (threads ?? []) as { id: string; signal_id: string; title: string | null }[]) {
      const name = nameById.get(t.signal_id);
      if (name && name !== t.title) {
        await db.from("signal_threads").update({ title: name }).eq("id", t.id);
      }
    }
    console.log(`[contacts] synced ${rows.length} for ${userId}`);
  } catch (e) {
    console.log(`[contacts] sync failed for ${userId}: ${String(e)}`);
  }
}

/** Sync contacts for every active account (called once the RPC is ready). */
async function syncAllContacts(): Promise<void> {
  for (const [number, userId] of accountToUser) void syncContacts(userId, number);
}

// ── signal-cli daemon + JSON-RPC client ───────────────────────────────────────

let daemon: ChildProcess | null = null;
let rpcSocket: Socket | null = null;
let rpcReady = false;
let rpcBuffer = "";
let nextId = 1;
const pending = new Map<
  number,
  { resolve: (v: unknown) => void; reject: (e: Error) => void }
>();

function handleRpcLine(line: string): void {
  let msg: {
    id?: number;
    result?: unknown;
    error?: { message?: string };
    method?: string;
    params?: unknown;
  };
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  // Response to one of our requests.
  if (typeof msg.id === "number" && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (!p) return;
    if (msg.error) p.reject(new Error(msg.error.message ?? "signal rpc error"));
    else p.resolve(msg.result);
    return;
  }
  // Push notification: an incoming (or sent-elsewhere) message.
  if (msg.method === "receive" && msg.params && typeof msg.params === "object") {
    const params = msg.params as { account?: string; envelope?: RawEnvelope };
    const userId = params.account ? accountToUser.get(params.account) : undefined;
    if (!userId) return;
    // Delivery/read receipts ride the same "receive" push — handle first.
    if (params.envelope?.receiptMessage) {
      void applyReceipt(userId, params.envelope.receiptMessage);
      return;
    }
    const inbound = toInbound(userId, msg.params);
    if (inbound) void writeInbound(inbound);
  }
}

function connectRpc(): void {
  const sock = connect(RPC_PORT, RPC_HOST);
  sock.on("connect", () => {
    rpcSocket = sock;
    rpcReady = true;
    rpcBuffer = "";
    console.log("[rpc] connected to daemon");
    // The daemon is up — refresh each account's contact directory.
    setTimeout(() => void syncAllContacts(), 1_000);
  });
  sock.on("data", (chunk: Buffer) => {
    rpcBuffer += chunk.toString();
    let nl: number;
    while ((nl = rpcBuffer.indexOf("\n")) >= 0) {
      const line = rpcBuffer.slice(0, nl);
      rpcBuffer = rpcBuffer.slice(nl + 1);
      if (line.trim()) handleRpcLine(line);
    }
  });
  sock.on("error", () => {
    /* 'close' fires next */
  });
  sock.on("close", () => {
    if (rpcReady) console.log("[rpc] disconnected");
    rpcReady = false;
    rpcSocket = null;
    // The daemon may still be booting (JVM start) or restarting — keep retrying.
    setTimeout(connectRpc, 1500);
  });
}

function startDaemon(): void {
  console.log("[daemon] starting signal-cli daemon");
  daemon = spawn(SIGNAL_CLI, [
    "-o",
    "json",
    "daemon",
    "--tcp",
    `${RPC_HOST}:${RPC_PORT}`,
    // on-connection (vs on-start): the daemon ties receive to our persistent
    // RPC connection. Leading hypothesis for "Rokki sends don't appear on the
    // phone" — needs live verification.
    "--receive-mode",
    "on-connection",
  ]);
  daemon.stdout?.on("data", (d: Buffer) =>
    console.log(`[daemon] ${d.toString().trim().slice(0, 200)}`),
  );
  daemon.stderr?.on("data", (d: Buffer) =>
    console.log(`[daemon:err] ${d.toString().trim().slice(0, 200)}`),
  );
  daemon.on("close", (code) => {
    console.log(`[daemon] exited ${code}; restarting in 5s`);
    rpcReady = false;
    rpcSocket?.destroy();
    rpcSocket = null;
    setTimeout(startDaemon, 5_000);
  });
  connectRpc();
}

/** Bounce the daemon (e.g. after a new account links) so it re-reads accounts. */
function restartDaemon(): void {
  if (daemon) daemon.kill("SIGTERM"); // 'close' handler respawns
  else startDaemon();
}

function rpcCall<T>(method: string, params: unknown): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (!rpcReady || !rpcSocket) {
      reject(new Error("Signal is still starting up — try again in a moment"));
      return;
    }
    const id = nextId++;
    const timer = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error("Signal RPC timed out"));
      }
    }, 30_000);
    pending.set(id, {
      resolve: (v) => {
        clearTimeout(timer);
        resolve(v as T);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });
    rpcSocket.write(`${JSON.stringify({ jsonrpc: "2.0", method, params, id })}\n`);
  });
}

// ── linking (still a direct spawn — interactive provisioning) ──────────────────

function startLink(userId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(SIGNAL_CLI, ["link", "-n", "Rokki"]);
    const t0 = Date.now();
    let gotUri = false;
    let number: string | null = null;

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
        if (!number) {
          const nums = await listAccountNumbers();
          if (nums.length === 1) number = nums[0];
        }
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
        await refreshAccountMap();
        // The daemon was started before this account existed — bounce it so it
        // starts receiving for the newly linked number.
        restartDaemon();
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

app.get("/health", (c) =>
  c.json({ ok: true, service: "signal-bridge", rpc: rpcReady }),
);

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
    attachments: StoredAttachment[];
  }>;
  const text = body.text ?? "";
  const atts = body.attachments ?? [];
  if (!body.signalNumber || !body.signalId || (!text && atts.length === 0)) {
    return c.json(
      { error: "signalNumber, signalId and text or attachments are required" },
      400,
    );
  }
  const isGroup = body.kind === "group";

  // signal-cli's send takes attachment FILE PATHS, so download each from
  // storage to a temp file. (The web pre-uploaded them under the user's key.)
  const tempPaths: string[] = [];
  for (const a of atts) {
    try {
      const { data, error } = await db.storage.from(MEDIA_BUCKET).download(a.storage_key);
      if (error || !data) continue;
      const buf = Buffer.from(await data.arrayBuffer());
      const tmp = join(tmpdir(), `rokki-signal-${randomUUID()}`);
      await writeFile(tmp, buf);
      tempPaths.push(tmp);
    } catch (e) {
      console.log(`[media] send download failed ${a.storage_key}: ${String(e)}`);
    }
  }

  const base = isGroup
    ? { account: body.signalNumber, groupId: body.signalId, message: text }
    : { account: body.signalNumber, recipient: [body.signalId], message: text };
  const params = tempPaths.length ? { ...base, attachments: tempPaths } : base;

  try {
    // The send result carries signal-cli's message timestamp — the id that
    // delivery/read receipts reference. Storing the REAL timestamp (not a
    // fabricated Date.now()) is what lets receipts correlate back to this row.
    const res = await rpcCall<{ timestamp?: number; results?: Array<{ type?: string }> }>(
      "send",
      params,
    );
    const externalId = String(res?.timestamp ?? Date.now());
    const anyFail = (res?.results ?? []).some((r) => r.type && r.type !== "SUCCESS");
    await writeInbound({
      userId,
      signalId: body.signalId,
      kind: isGroup ? "group" : "direct",
      direction: "out",
      sender: null,
      body: text,
      externalId,
      sentAt: new Date().toISOString(),
      status: anyFail ? "failed" : "sent",
      attachments: atts,
    });
    return c.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // "starting up" is transient (daemon booting) → 503 so the UI can retry.
    const status = msg.includes("starting up") ? 503 : 500;
    return c.json({ error: msg }, status);
  } finally {
    for (const p of tempPaths) await unlink(p).catch(() => {});
  }
});

app.post("/accounts/:userId/read", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Partial<{
    signalNumber: string;
    recipient: string;
    timestamps: number[];
  }>;
  if (!body.signalNumber || !body.recipient || !body.timestamps?.length) {
    return c.json({ error: "signalNumber, recipient and timestamps are required" }, 400);
  }
  try {
    await rpcCall("sendReceipt", {
      account: body.signalNumber,
      recipient: body.recipient,
      targetTimestamps: body.timestamps,
      type: "read",
    });
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

app.post("/accounts/:userId/sync", async (c) => {
  const userId = c.req.param("userId");
  const { data } = await db
    .from("signal_accounts")
    .select("signal_number")
    .eq("user_id", userId)
    .maybeSingle();
  const number = (data as { signal_number?: string | null } | null)?.signal_number;
  if (!number) return c.json({ error: "Signal isn't connected" }, 400);
  await syncContacts(userId, number);
  return c.json({ ok: true });
});

void (async () => {
  await refreshAccountMap();
  startDaemon();
})();
serve({ fetch: app.fetch, port: PORT });
console.log(`signal-bridge listening on :${PORT}`);
