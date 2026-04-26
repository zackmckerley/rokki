"use client";

/**
 * Offline mutation queue.
 *
 * Stores pending writes (POST / PATCH / PUT / DELETE) in IndexedDB so the
 * page can fire-and-forget while disconnected and have them drain on
 * reconnect. The drain is best-effort, in-order, and yields conflict
 * payloads (HTTP 409) to UI listeners for manual resolution.
 *
 * Design choices:
 *   - No external IndexedDB wrapper. The store has one schema; a 50-line
 *     promisified shim keeps the shipped JS small.
 *   - Queue is a plain auto-increment store; we sort by `createdAt` on
 *     drain so server-side ordering matches user intent even if the
 *     auto-increment IDs aren't monotonic across SW restarts (they should
 *     be, but we don't rely on it).
 *   - Bounded at 200 entries. New mutations beyond the cap are rejected.
 *     The idea is that 200 outstanding writes means something is broken,
 *     not that the user is going to type their way out of it.
 *   - Conflict (409) responses are surfaced via a custom event named
 *     `rokki:offline-conflict` carrying the entry + server payload, so
 *     ConflictDialog can pick them up without coupling to the queue.
 */

const DB_NAME = "rokki-offline";
const DB_VERSION = 1;
const STORE = "mutations";

export const QUEUE_CAP = 200;
export const MAX_ATTEMPTS = 5;

export type QueueStatus = "pending" | "syncing" | "failed";

export interface QueueEntry {
  /** IndexedDB-assigned numeric id. Stable for the lifetime of the entry. */
  id: number;
  method: "POST" | "PATCH" | "PUT" | "DELETE";
  url: string;
  /** Stored as a JSON string; null when the original request had no body. */
  body: string | null;
  /** Stringified headers (excluding Content-Type, which we always set). */
  headers: Record<string, string>;
  createdAt: number;
  attempts: number;
  lastError: string | null;
  status: QueueStatus;
  /**
   * Free-form label so the queue panel can describe what's pending without
   * teaching the queue about every endpoint. Optional — the URL is the
   * fallback display.
   */
  label?: string;
}

/* ------------------------------------------------------------------ */
/* IndexedDB shim                                                      */
/* ------------------------------------------------------------------ */

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available"));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IDB open failed"));
  });
  return dbPromise;
}

function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>,
): Promise<T> {
  return getDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        let result: T | undefined;
        try {
          const r = fn(store);
          if (r instanceof Promise) {
            r.then((v) => (result = v)).catch(reject);
          } else {
            r.onsuccess = () => (result = r.result as T);
            r.onerror = () => reject(r.error);
          }
        } catch (e) {
          reject(e);
          return;
        }
        t.oncomplete = () => resolve(result as T);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error ?? new Error("aborted"));
      }),
  );
}

/* ------------------------------------------------------------------ */
/* Queue API                                                           */
/* ------------------------------------------------------------------ */

export interface EnqueueInput {
  method: QueueEntry["method"];
  url: string;
  body?: unknown;
  headers?: Record<string, string>;
  label?: string;
}

export interface EnqueueResult {
  id: number;
  queuedAt: number;
}

export async function enqueueMutation(input: EnqueueInput): Promise<EnqueueResult> {
  const count = await queueSize();
  if (count >= QUEUE_CAP) {
    throw new QueueFullError(QUEUE_CAP);
  }
  const entry: Omit<QueueEntry, "id"> = {
    method: input.method,
    url: input.url,
    body:
      input.body === undefined || input.body === null
        ? null
        : typeof input.body === "string"
          ? input.body
          : JSON.stringify(input.body),
    headers: input.headers ?? {},
    createdAt: Date.now(),
    attempts: 0,
    lastError: null,
    status: "pending",
    label: input.label,
  };
  const id = await tx<IDBValidKey>("readwrite", (s) => s.add(entry as QueueEntry));
  emit("queue-changed");
  return { id: Number(id), queuedAt: entry.createdAt };
}

export async function listQueue(): Promise<QueueEntry[]> {
  return tx<QueueEntry[]>("readonly", (s) => s.getAll() as IDBRequest<QueueEntry[]>).then(
    (rows) => rows.sort((a, b) => a.createdAt - b.createdAt),
  );
}

export async function queueSize(): Promise<number> {
  return tx<number>("readonly", (s) => s.count());
}

export async function discardEntry(id: number): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
  emit("queue-changed");
}

export async function clearQueue(): Promise<void> {
  await tx("readwrite", (s) => s.clear());
  emit("queue-changed");
}

async function updateEntry(
  id: number,
  patch: Partial<Omit<QueueEntry, "id">>,
): Promise<QueueEntry | null> {
  return tx<QueueEntry | null>("readwrite", (s) => {
    return new Promise<QueueEntry | null>((resolve, reject) => {
      const getReq = s.get(id);
      getReq.onsuccess = () => {
        const cur = getReq.result as QueueEntry | undefined;
        if (!cur) return resolve(null);
        const next = { ...cur, ...patch };
        const putReq = s.put(next);
        putReq.onsuccess = () => resolve(next);
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  });
}

export class QueueFullError extends Error {
  cap: number;
  constructor(cap: number) {
    super(`Offline queue is full (cap = ${cap}).`);
    this.cap = cap;
    this.name = "QueueFullError";
  }
}

/* ------------------------------------------------------------------ */
/* Drain                                                               */
/* ------------------------------------------------------------------ */

let draining: Promise<void> | null = null;

/**
 * Send every pending entry to the network in `createdAt` order. Stops
 * (and leaves the queue intact) on the first network error so retries
 * happen on the next online event. Concurrent calls collapse into the
 * same in-flight drain.
 */
export function processQueue(): Promise<void> {
  if (typeof navigator === "undefined") return Promise.resolve();
  if (!navigator.onLine) return Promise.resolve();
  if (draining) return draining;
  draining = (async () => {
    try {
      const entries = await listQueue();
      for (const entry of entries) {
        // Skip entries we've already given up on. The user retries them
        // explicitly via the queue panel.
        if (entry.status === "failed") continue;
        const stop = await drainOne(entry);
        if (stop) break;
      }
    } finally {
      draining = null;
      emit("queue-changed");
    }
  })();
  return draining;
}

/**
 * Returns `true` when the caller should stop draining (network error).
 */
async function drainOne(entry: QueueEntry): Promise<boolean> {
  await updateEntry(entry.id, { status: "syncing" });
  emit("queue-changed");
  let res: Response;
  try {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...entry.headers,
    };
    res = await fetch(entry.url, {
      method: entry.method,
      headers,
      credentials: "include",
      body: entry.body,
    });
  } catch (err) {
    // Network error — keep the entry, bump attempts, surface it.
    const msg = err instanceof Error ? err.message : String(err);
    await updateEntry(entry.id, {
      status: "pending",
      attempts: entry.attempts + 1,
      lastError: msg,
    });
    return true;
  }

  if (res.status === 409) {
    // Conflict — let the UI mediate. Keep the entry as failed so the user
    // can resolve and retry.
    let server: unknown = null;
    try {
      server = await res.clone().json();
    } catch {
      // pass
    }
    await updateEntry(entry.id, {
      status: "failed",
      attempts: entry.attempts + 1,
      lastError: "conflict",
    });
    emit("conflict", { entry, server });
    return false;
  }

  if (res.ok || res.status === 204) {
    await tx("readwrite", (s) => s.delete(entry.id));
    return false;
  }

  if (res.status >= 400 && res.status < 500) {
    // Validation / auth / not-found — won't succeed on retry. Mark failed.
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.clone().json()) as {
        errors?: { message?: string }[];
      };
      detail = body.errors?.[0]?.message ?? detail;
    } catch {
      // pass
    }
    await updateEntry(entry.id, {
      status: "failed",
      attempts: entry.attempts + 1,
      lastError: detail,
    });
    return false;
  }

  // 5xx — server hiccup. Bump attempts and stop the drain so we back off.
  if (entry.attempts + 1 >= MAX_ATTEMPTS) {
    await updateEntry(entry.id, {
      status: "failed",
      attempts: entry.attempts + 1,
      lastError: `HTTP ${res.status}`,
    });
    return false;
  }
  await updateEntry(entry.id, {
    status: "pending",
    attempts: entry.attempts + 1,
    lastError: `HTTP ${res.status}`,
  });
  return true;
}

export async function retryEntry(id: number): Promise<void> {
  await updateEntry(id, { status: "pending", lastError: null });
  emit("queue-changed");
  await processQueue();
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

export type QueueEventDetail =
  | { type: "queue-changed" }
  | { type: "conflict"; entry: QueueEntry; server: unknown };

const QUEUE_CHANGED = "rokki:offline-queue-changed";
const CONFLICT = "rokki:offline-conflict";

function emit(
  type: "queue-changed" | "conflict",
  data?: { entry: QueueEntry; server: unknown },
) {
  if (typeof window === "undefined") return;
  if (type === "queue-changed") {
    window.dispatchEvent(new CustomEvent(QUEUE_CHANGED));
  } else if (data) {
    window.dispatchEvent(new CustomEvent(CONFLICT, { detail: data }));
  }
}

export function onQueueChanged(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(QUEUE_CHANGED, cb);
  return () => window.removeEventListener(QUEUE_CHANGED, cb);
}

export function onConflict(
  cb: (detail: { entry: QueueEntry; server: unknown }) => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = (e: Event) => {
    const ce = e as CustomEvent<{ entry: QueueEntry; server: unknown }>;
    cb(ce.detail);
  };
  window.addEventListener(CONFLICT, handler);
  return () => window.removeEventListener(CONFLICT, handler);
}
