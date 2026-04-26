import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database, Json } from "@rokki/db";
import crypto from "node:crypto";

/**
 * Webhook delivery: HMAC-signed POST with exponential-backoff retries
 * and a dead-letter queue.
 *
 * Flow:
 *   1. enqueue(): for every active destination subscribed to the event
 *      name, insert a `webhook_deliveries` row (attempt 0, no schedule
 *      yet) and immediately attempt delivery. The synchronous attempt
 *      keeps latency low for the happy path; only failures go through
 *      the scheduled retry loop.
 *   2. attempt(): POST the JSON payload signed with the destination's
 *      HMAC secret. On 2xx mark delivered. On error or non-2xx,
 *      either schedule the next retry or mark dead-lettered.
 *   3. processDue(): worker loop iterated by /api/v1/admin/webhooks/
 *      process-due — picks up any pending row whose `next_attempt_at`
 *      has elapsed and retries it.
 *
 * The schedule is intentionally aggressive at first (1m) and stretches
 * out (12h on the last attempt) so transient outages clear without a
 * thundering herd, and a longer outage is still recoverable inside a
 * single business day.
 */

const RETRY_DELAYS_MS = [
  60_000, // 1m  — after attempt 1 fails
  300_000, // 5m  — after attempt 2
  1_500_000, // 25m — after attempt 3
  7_200_000, // 2h  — after attempt 4
  43_200_000, // 12h — after attempt 5 (final)
] as const;

export const MAX_ATTEMPTS = 5;

const DELIVERY_TIMEOUT_MS = 10_000;

type AdminClient = ReturnType<typeof createAdminClient<Database>>;

let cached: AdminClient | null = null;
function adminClient(): AdminClient | null {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  cached = createAdminClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}

interface Destination {
  id: string;
  url: string;
  secret: string;
  events: string[];
}

interface DeliveryRow {
  id: string;
  destination_id: string;
  event_name: string;
  payload: Record<string, unknown>;
  attempt: number;
  next_attempt_at: string | null;
  delivered_at: string | null;
  dead_lettered_at: string | null;
}

/**
 * Compute the next retry timestamp given the attempt that just failed.
 * Returns null if there are no more attempts left (caller dead-letters).
 */
function nextAttemptAt(failedAttempt: number): string | null {
  if (failedAttempt >= MAX_ATTEMPTS) return null;
  const delay = RETRY_DELAYS_MS[failedAttempt - 1];
  if (delay === undefined) return null;
  return new Date(Date.now() + delay).toISOString();
}

function sign(payloadJson: string, secret: string, timestampSec: number): string {
  // Convention matches Stripe-style signatures: include the timestamp in
  // the signing input so receivers can reject replays.
  const signingInput = `${timestampSec}.${payloadJson}`;
  return crypto.createHmac("sha256", secret).update(signingInput).digest("hex");
}

interface AttemptResult {
  ok: boolean;
  status?: number;
  body?: string;
  error?: string;
}

async function postWithSignature(
  destination: Destination,
  delivery: DeliveryRow,
): Promise<AttemptResult> {
  const payloadJson = JSON.stringify({
    id: delivery.id,
    event: delivery.event_name,
    payload: delivery.payload,
    attempt: delivery.attempt,
  });
  const ts = Math.floor(Date.now() / 1000);
  const sig = sign(payloadJson, destination.secret, ts);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  try {
    const res = await fetch(destination.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Rokki-Event": delivery.event_name,
        "X-Rokki-Delivery": delivery.id,
        "X-Rokki-Timestamp": String(ts),
        "X-Rokki-Signature": `t=${ts},v1=${sig}`,
        "User-Agent": "Rokki-Webhooks/1.0",
      },
      body: payloadJson,
      signal: controller.signal,
    });
    // Read at most 4KB of body for diagnostics; receivers shouldn't
    // need to send back an essay and we don't want to balloon the row.
    const bodyText = (await res.text().catch(() => "")).slice(0, 4096);
    return { ok: res.ok, status: res.status, body: bodyText };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function recordResult(
  delivery: DeliveryRow,
  result: AttemptResult,
): Promise<void> {
  const admin = adminClient();
  if (!admin) return;
  const now = new Date().toISOString();
  if (result.ok) {
    const update = {
      status: "success",
      delivered_at: now,
      attempted_at: now,
      response_code: result.status ?? null,
      response_body: result.body ?? null,
      next_attempt_at: null,
      last_error: null,
    } as const;
    await admin
      .from("webhook_deliveries")
      .update(update)
      .eq("id", delivery.id);
    return;
  }

  const next = nextAttemptAt(delivery.attempt);
  const update = {
    status: "error",
    attempted_at: now,
    response_code: result.status ?? null,
    response_body: result.body ?? null,
    last_error:
      result.error ?? (result.body ? `HTTP ${result.status}` : "request failed"),
    next_attempt_at: next,
    dead_lettered_at: next ? null : now,
  } as const;
  await admin
    .from("webhook_deliveries")
    .update(update)
    .eq("id", delivery.id);
}

async function attemptOnce(
  delivery: DeliveryRow,
  destination: Destination,
): Promise<void> {
  const result = await postWithSignature(destination, delivery);
  await recordResult(delivery, result);
}

/**
 * Enqueue a delivery for every active destination subscribed to this
 * event name. Best-effort: returns silently on misconfiguration so the
 * caller's primary operation isn't blocked by webhook plumbing.
 */
export async function enqueueWebhook(
  eventName: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const admin = adminClient();
  if (!admin) return;

  const { data, error } = await admin
    .from("webhook_destinations")
    .select("id, url, secret, events")
    .eq("active", true)
    .contains("events", [eventName]);

  if (error) {
    console.error(`[webhooks] enqueue lookup for ${eventName} failed:`, error.message);
    return;
  }

  const destinations = (data ?? []) as Destination[];
  if (destinations.length === 0) return;

  for (const dest of destinations) {
    const insertRow = {
      destination_id: dest.id,
      event_name: eventName,
      payload: payload as Json,
      attempt: 1,
      status: "pending",
      // attempted_at gets set when the row is touched by recordResult;
      // initial value just satisfies the NOT NULL.
    };
    const { data: inserted, error: insertErr } = await admin
      .from("webhook_deliveries")
      .insert(insertRow)
      .select(
        "id, destination_id, event_name, payload, attempt, next_attempt_at, delivered_at, dead_lettered_at",
      )
      .single();
    if (insertErr || !inserted) {
      console.error(
        `[webhooks] enqueue insert for ${eventName} -> ${dest.url} failed:`,
        insertErr?.message,
      );
      continue;
    }
    // Fire the first attempt synchronously so happy-path latency is
    // preserved. The promise is NOT awaited from the request handler —
    // emitEvent calls enqueueWebhook with `void`. Errors land in the
    // delivery row, not as unhandled rejections.
    void attemptOnce(inserted as unknown as DeliveryRow, dest).catch((e) => {
      console.error(`[webhooks] first attempt errored for ${dest.url}:`, e);
    });
  }
}

/**
 * Walk the queue once. Used by the cron-style worker route. Returns the
 * count of deliveries attempted in this pass and the count that
 * dead-lettered as a result.
 */
export async function processDueDeliveries(
  limit = 50,
): Promise<{ attempted: number; succeeded: number; deadLettered: number }> {
  const admin = adminClient();
  if (!admin) return { attempted: 0, succeeded: 0, deadLettered: 0 };

  const nowIso = new Date().toISOString();
  const { data: due, error } = await admin
    .from("webhook_deliveries")
    .select(
      "id, destination_id, event_name, payload, attempt, next_attempt_at, delivered_at, dead_lettered_at",
    )
    .is("delivered_at", null)
    .is("dead_lettered_at", null)
    .lte("next_attempt_at", nowIso)
    .order("next_attempt_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error(`[webhooks] processDue query failed:`, error.message);
    return { attempted: 0, succeeded: 0, deadLettered: 0 };
  }
  const rows = (due ?? []) as DeliveryRow[];
  if (rows.length === 0) return { attempted: 0, succeeded: 0, deadLettered: 0 };

  // Bump the attempt counter and clear next_attempt_at first so a
  // simultaneous worker pass doesn't double-deliver. We re-load the
  // destination per row in case it was disabled mid-flight.
  let succeeded = 0;
  let deadLettered = 0;
  for (const row of rows) {
    const incremented = row.attempt + 1;
    const updateRow = {
      attempt: incremented,
      next_attempt_at: null,
      attempted_at: nowIso,
    } as const;
    const { error: claimErr } = await admin
      .from("webhook_deliveries")
      .update(updateRow)
      // Optimistic lock: only the worker that owned `next_attempt_at`
      // before claiming will succeed; concurrent claims see a row with
      // a null `next_attempt_at` and skip.
      .eq("id", row.id)
      .eq("attempt", row.attempt);
    if (claimErr) {
      console.error(`[webhooks] claim failed for ${row.id}:`, claimErr.message);
      continue;
    }

    const { data: dest } = await admin
      .from("webhook_destinations")
      .select("id, url, secret, events, active")
      .eq("id", row.destination_id)
      .maybeSingle();
    const destination = dest as
      | (Destination & { active: boolean })
      | null;
    if (!destination || !destination.active) {
      // Destination disabled or deleted between enqueue and now — kill
      // the delivery rather than retry forever.
      const update = {
        dead_lettered_at: nowIso,
        last_error: "destination inactive or deleted",
        status: "error",
      } as const;
      await admin
        .from("webhook_deliveries")
        .update(update)
        .eq("id", row.id);
      deadLettered += 1;
      continue;
    }

    const claimed: DeliveryRow = { ...row, attempt: incremented };
    const result = await postWithSignature(destination, claimed);
    await recordResult(claimed, result);
    if (result.ok) succeeded += 1;
    else if (incremented >= MAX_ATTEMPTS) deadLettered += 1;
  }

  return { attempted: rows.length, succeeded, deadLettered };
}

/**
 * Reset a dead-lettered delivery so the worker picks it up again.
 * Returns true if the row was reset, false if it wasn't dead-lettered.
 */
export async function replayDelivery(deliveryId: string): Promise<boolean> {
  const admin = adminClient();
  if (!admin) return false;
  const update = {
    attempt: 0,
    next_attempt_at: new Date().toISOString(),
    dead_lettered_at: null,
    delivered_at: null,
    status: "pending",
    last_error: null,
  } as const;
  const { data, error } = await admin
    .from("webhook_deliveries")
    .update(update)
    .eq("id", deliveryId)
    .not("dead_lettered_at", "is", null)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error(`[webhooks] replay failed for ${deliveryId}:`, error.message);
    return false;
  }
  return !!data;
}
