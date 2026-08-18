/**
 * Web Push subscription manager.
 *
 * - Registers the service worker
 * - Requests notification permission
 * - Subscribes to push via the VAPID public key
 * - Sends the subscription to the backend
 */

import { api } from "./api";

let swRegistration: ServiceWorkerRegistration | null = null;

/** Register the service worker and return the registration. */
export async function getSWRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (swRegistration) return swRegistration;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;

  try {
    swRegistration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    return swRegistration;
  } catch (error) {
    console.warn("[push] Service worker registration failed:", error);
    return null;
  }
}

/** Check if push notifications are supported and enabled on the server. */
export async function isPushSupported(): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  try {
    const data = await api.get<{ publicKey: string; enabled: boolean }>("/push/vapid-public-key");
    return data.enabled && Boolean(data.publicKey);
  } catch {
    return false;
  }
}

/** Get the current notification permission state. */
export function getPermissionState(): NotificationPermission {
  if (!("Notification" in window)) return "denied";
  return Notification.permission;
}

/** Subscribe to push notifications and register with the backend. */
export async function subscribeToPush(): Promise<boolean> {
  const reg = await getSWRegistration();
  if (!reg) return false;

  // Request permission.
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  // Get VAPID public key from the backend.
  const { publicKey } = await api.get<{ publicKey: string }>("/push/vapid-public-key");
  if (!publicKey) return false;

  // Convert the VAPID key to the format PushManager expects.
  const applicationServerKey = urlBase64ToUint8Array(publicKey);

  // Subscribe.
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
  });

  const sub = subscription.toJSON();
  if (!sub.endpoint || !sub.keys) return false;

  // Send to backend.
  await api.post("/push/subscribe", {
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    userAgent: navigator.userAgent,
  });

  return true;
}

/** Unsubscribe from push notifications. */
export async function unsubscribeFromPush(): Promise<boolean> {
  const reg = await getSWRegistration();
  if (!reg) return false;

  const subscription = await reg.pushManager.getSubscription();
  if (!subscription) return false;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();

  try {
    await api.post("/push/unsubscribe", { endpoint });
  } catch {
    // Best-effort: even if the backend call fails, the local subscription is removed.
  }

  return true;
}

/** Check if the user is currently subscribed. */
export async function isSubscribed(): Promise<boolean> {
  const reg = await getSWRegistration();
  if (!reg) return false;
  const subscription = await reg.pushManager.getSubscription();
  return subscription !== null;
}

/** Helper: convert a VAPID public key from base64url to Uint8Array. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
