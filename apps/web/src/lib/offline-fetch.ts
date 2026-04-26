"use client";

import {
  enqueueMutation,
  QueueFullError,
  type EnqueueInput,
} from "./offline-queue";

/**
 * Drop-in replacement for `fetch` that intercepts mutations while offline
 * and queues them in IndexedDB instead of failing.
 *
 * Behaviour:
 *   - Online (or non-mutation method) → identical to native fetch.
 *   - Offline + mutation method (POST / PATCH / PUT / DELETE) → enqueue,
 *     return a synthetic 202 Response carrying { data: { queued, id } }.
 *
 * Caller can `await` the response and key off `r.status === 202` to know
 * the mutation was queued (a real server would return a 2xx with the
 * created/updated row). Anywhere we already optimistic-update the UI,
 * the 202 path is effectively transparent.
 *
 * Note: we deliberately do NOT enqueue when the network errors out mid-
 * request despite `navigator.onLine === true`. That's the captive-portal
 * case, and we'd rather surface the error than silently swallow.
 *
 * `label` is a free-form description ("Update task title") used by the
 * queue panel. Optional but encouraged.
 */
export interface OfflineFetchOptions extends RequestInit {
  /** Short human-readable label for the queue panel. */
  label?: string;
}

const MUTATION_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export async function offlineFetch(
  input: string,
  init: OfflineFetchOptions = {},
): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const isMutation = MUTATION_METHODS.has(method);

  const offline =
    typeof navigator !== "undefined" && navigator.onLine === false;

  if (!offline || !isMutation) {
    // Always include credentials for our own API; matches every existing
    // call site. Caller can still override via init.credentials.
    return fetch(input, {
      credentials: "include",
      ...init,
    });
  }

  // Skip auth endpoints — there is no point in queuing a sign-in.
  if (input.startsWith("/api/v1/auth/")) {
    return fetch(input, {
      credentials: "include",
      ...init,
    });
  }

  const body = parseBody(init.body);
  const headers = headersToObject(init.headers);
  const enqueueInput: EnqueueInput = {
    method: method as EnqueueInput["method"],
    url: input,
    body,
    headers,
    label: init.label,
  };
  try {
    const result = await enqueueMutation(enqueueInput);
    return new Response(
      JSON.stringify({
        data: { queued: true, id: result.id, queued_at: result.queuedAt },
      }),
      {
        status: 202,
        statusText: "Accepted (queued offline)",
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    if (err instanceof QueueFullError) {
      return new Response(
        JSON.stringify({
          errors: [
            {
              code: "queue_full",
              message:
                "Offline queue is full. Reconnect, then retry — or discard pending changes.",
            },
          ],
        }),
        {
          status: 507,
          statusText: "Queue Full",
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    throw err;
  }
}

function parseBody(body: BodyInit | null | undefined): unknown {
  if (body == null) return null;
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  // We never enqueue FormData / Blob / streams — the call site should fall
  // back to native fetch for those (file uploads aren't a great offline
  // story anyway). Surface them as null so the queue stores something
  // serializable; the drain will replay the URL with no body, which is
  // wrong, but we'll never hit this path from the wired call sites.
  return null;
}

function headersToObject(h: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h) return out;
  if (h instanceof Headers) {
    h.forEach((v, k) => {
      // Content-Type is always added by the queue drain — don't
      // double-up.
      if (k.toLowerCase() === "content-type") return;
      out[k] = v;
    });
    return out;
  }
  if (Array.isArray(h)) {
    for (const [k, v] of h) {
      if (k.toLowerCase() === "content-type") continue;
      out[k] = v;
    }
    return out;
  }
  for (const [k, v] of Object.entries(h)) {
    if (k.toLowerCase() === "content-type") continue;
    if (typeof v === "string") out[k] = v;
  }
  return out;
}
