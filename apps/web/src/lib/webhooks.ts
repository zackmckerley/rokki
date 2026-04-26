import { createClient as createAdminClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@rokki/db";
import crypto from "node:crypto";
import { enqueueJob, type JobRow } from "./jobs";

/**
 * Outbound webhook delivery.
 *
 * State lives in two tables:
 *   - webhook_deliveries: one row per (destination, event), updated in
 *     place across attempts. The audit trail.
 *   - jobs(queue='webhook_delivery'): the orchestrator. Carries the
 *     retry schedule and dead-letter logic via the generic queue
 *     (apps/web/src/lib/jobs.ts). Payload: { delivery_id }.
 *
 * Why split? The deliveries table is what admins want to look at — one
 * row per "we tried to send this event to this endpoint, here's how it
 * went". The job is the scheduler artifact and gets cleaned up once
 * complete. Old code had a single row per attempt; that made "did we
 * eventually succeed?" a window function and made retry logic hard to
 * surface in UI.
 */

const QUEUE = "webhook_delivery";
const DELIVERY_TIMEOUT_MS = 10_000;

let cachedAdmin: SupabaseClient<Database> | null = null;
function admin(): SupabaseClient<Database> {
  if (cachedAdmin) return cachedAdmin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("[webhooks] supabase env missing");
  cachedAdmin = createAdminClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cachedAdmin;
}

interface DispatchArgs {
  destinationId: string;
  eventName: string;
  eventId?: string | null;
  payload: Record<string, unknown>;
}

/**
 * Enqueue a single delivery attempt. Creates the webhook_deliveries
 * row first (so admins always see the intent) then enqueues a job
 * that points at it.
 */
export async function dispatchWebhookDelivery(args: DispatchArgs): Promise<{
  delivery_id: string;
  job_id: string;
}> {
  const insert = {
    destination_id: args.destinationId,
    event_name: args.eventName,
    event_id: args.eventId ?? null,
    payload: args.payload as unknown as Json,
    status: "pending" as const,
    attempt: 0,
  };
  const { data, error } = await (
    admin()
      .from("webhook_deliveries")
      .insert(insert as never)
      .select("id")
      .single() as unknown as Promise<{
      data: { id: string } | null;
      error: { message: string } | null;
    }>
  );
  if (error || !data) {
    throw new Error(`[webhooks] could not record delivery: ${error?.message ?? "no row"}`);
  }
  const job_id = await enqueueJob({
    queue: QUEUE,
    payload: { delivery_id: data.id } as Json,
  });
  return { delivery_id: data.id, job_id };
}

/**
 * The job handler. Registered with the worker endpoint. Reads the
 * delivery row, signs the body, posts it, updates the delivery row
 * with the outcome, and either resolves (on success/4xx/dead) or
 * throws (so the queue can reschedule).
 */
export async function webhookDeliveryHandler(job: JobRow): Promise<void> {
  const payload = (job.payload ?? {}) as { delivery_id?: string };
  const deliveryId = payload.delivery_id;
  if (!deliveryId) {
    // Bad job — log and resolve so we don't loop on it forever.
    throw new Error("missing delivery_id in payload");
  }

  // Pull delivery + destination together.
  const { data: delivery, error: dErr } = await (
    admin()
      .from("webhook_deliveries")
      .select("id, destination_id, event_name, payload, attempt")
      .eq("id", deliveryId)
      .maybeSingle() as unknown as Promise<{
      data: {
        id: string;
        destination_id: string;
        event_name: string;
        payload: Json;
        attempt: number;
      } | null;
      error: { message: string } | null;
    }>
  );
  if (dErr) throw new Error(`delivery lookup: ${dErr.message}`);
  if (!delivery) throw new Error(`delivery ${deliveryId} not found`);

  const { data: dest, error: destErr } = await (
    admin()
      .from("webhook_destinations")
      .select("id, url, secret, active, events")
      .eq("id", delivery.destination_id)
      .maybeSingle() as unknown as Promise<{
      data: {
        id: string;
        url: string;
        secret: string;
        active: boolean;
        events: string[];
      } | null;
      error: { message: string } | null;
    }>
  );
  if (destErr) throw new Error(`destination lookup: ${destErr.message}`);
  if (!dest) {
    // Destination went away mid-flight — mark resolved as dead so we
    // don't keep retrying.
    await markDelivery(deliveryId, "dead", null, "destination deleted");
    return;
  }
  if (!dest.active) {
    await markDelivery(deliveryId, "dead", null, "destination paused");
    return;
  }

  const body = JSON.stringify({
    event: delivery.event_name,
    data: delivery.payload,
    delivered_at: new Date().toISOString(),
  });
  const signature = signBody(dest.secret, body);

  let responseCode: number | null = null;
  let responseBody: string | null = null;
  let attemptNo = (delivery.attempt ?? 0) + 1;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), DELIVERY_TIMEOUT_MS);
    const res = await fetch(dest.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Rokki-Event": delivery.event_name,
        "X-Rokki-Signature": signature,
        "X-Rokki-Delivery": delivery.id,
      },
      body,
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    responseCode = res.status;
    // Trim to keep audit rows small. 1KB is plenty for diagnostic.
    const text = await res.text().catch(() => "");
    responseBody = text.length > 1024 ? text.slice(0, 1024) + "…" : text;

    if (res.ok) {
      await (
        admin()
          .from("webhook_deliveries")
          .update({
            status: "success",
            attempt: attemptNo,
            response_code: responseCode,
            response_body: responseBody,
            last_attempt_at: new Date().toISOString(),
            delivered_at: new Date().toISOString(),
          } as never)
          .eq("id", deliveryId) as unknown as Promise<unknown>
      );
      return; // success — don't throw, queue will mark done.
    }

    // 4xx (except 408 / 429) is a permanent failure — no point retrying.
    const isPermanent = res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429;
    await (
      admin()
        .from("webhook_deliveries")
        .update({
          status: isPermanent ? "dead" : "error",
          attempt: attemptNo,
          response_code: responseCode,
          response_body: responseBody,
          last_attempt_at: new Date().toISOString(),
          dead_at: isPermanent ? new Date().toISOString() : null,
        } as never)
        .eq("id", deliveryId) as unknown as Promise<unknown>
    );
    if (isPermanent) return; // don't retry — return cleanly so job marks done.
    throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (responseCode === null) {
      // Update for transport-level failures (DNS, abort, network).
      await (
        admin()
          .from("webhook_deliveries")
          .update({
            status: "error",
            attempt: attemptNo,
            response_code: null,
            response_body: msg.slice(0, 1024),
            last_attempt_at: new Date().toISOString(),
          } as never)
          .eq("id", deliveryId) as unknown as Promise<unknown>
      );
    }
    throw err; // bubble so queue reschedules.
  }
}

async function markDelivery(
  id: string,
  status: "pending" | "success" | "error" | "dead",
  responseCode: number | null,
  responseBody: string | null,
): Promise<void> {
  await (
    admin()
      .from("webhook_deliveries")
      .update({
        status,
        response_code: responseCode,
        response_body: responseBody,
        last_attempt_at: new Date().toISOString(),
        dead_at: status === "dead" ? new Date().toISOString() : null,
      } as never)
      .eq("id", id) as unknown as Promise<unknown>
  );
}

function signBody(secret: string, body: string): string {
  // The `whsec_` prefix on stored secrets is a recognition aid — strip
  // it before HMAC so the receiving end doesn't need to know about it.
  const key = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  return (
    "sha256=" +
    crypto.createHmac("sha256", key).update(body).digest("hex")
  );
}

/** Exposed so the worker endpoint can register the handler. */
export const WEBHOOK_DELIVERY_QUEUE = QUEUE;
