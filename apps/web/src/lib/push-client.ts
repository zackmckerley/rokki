"use client";

/**
 * Browser-side helper for web-push subscription.
 *
 * Flow:
 *   1. ensureServiceWorker() — wait for the SW registration
 *   2. Notification.requestPermission()
 *   3. PushManager.subscribe({ applicationServerKey: VAPID public })
 *   4. POST to /api/v1/me/push-subscriptions
 *
 * Requires NEXT_PUBLIC_VAPID_PUBLIC_KEY. If missing, `isPushReady()` is
 * false and subscribeToPush() throws — UI should hide the "Enable
 * notifications" button in that case.
 */

export function isPushReady(): boolean {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;
  if (!("PushManager" in window)) return false;
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return false;
  return true;
}

export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushReady()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export async function subscribeToPush(): Promise<PushSubscription> {
  if (!isPushReady()) {
    throw new Error("Push notifications aren't configured on this deployment.");
  }
  if (Notification.permission === "denied") {
    throw new Error(
      "Notifications are blocked in your browser settings. Unblock Rokki and try again.",
    );
  }
  if (Notification.permission !== "granted") {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      throw new Error("Notification permission was not granted.");
    }
  }

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;

  const appServerKey = urlBase64ToUint8Array(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  );
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    // The DOM types want BufferSource; Uint8Array is a subtype but TS
    // strictness around ArrayBufferLike ≠ ArrayBuffer trips it up.
    applicationServerKey: appServerKey.buffer as ArrayBuffer,
  });

  // Ship the subscription to the server so it can dispatch pushes.
  const json = sub.toJSON() as {
    endpoint: string;
    keys?: { p256dh?: string; auth?: string };
  };
  await fetch("/api/v1/me/push-subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
      user_agent: navigator.userAgent,
    }),
  });

  return sub;
}

export async function unsubscribeFromPush(): Promise<void> {
  const sub = await getPushSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await fetch(
    `/api/v1/me/push-subscriptions?endpoint=${encodeURIComponent(endpoint)}`,
    { method: "DELETE", credentials: "include" },
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const out = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) out[i] = rawData.charCodeAt(i);
  return out;
}
