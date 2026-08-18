/**
 * Web Push notification service using VAPID (free, no third-party service needed).
 *
 * VAPID keys are generated once and stored in env vars:
 *   VAPID_PUBLIC_KEY  — sent to the browser
 *   VAPID_PRIVATE_KEY — kept server-side only
 *   VAPID_SUBJECT     — mailto: or https:// URL for the push service
 *
 * Generate keys once with: npx web-push generate-vapid-keys
 */

import webPush from "web-push";
import { PushSubscription } from "../models/PushSubscription.js";

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY ?? "";
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY ?? "";
const vapidSubject = process.env.VAPID_SUBJECT ?? "mailto:admin@ramnagareats.test";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn("[push] VAPID keys not configured — push notifications are disabled");
    return;
  }
  webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  configured = true;
}

export function getVapidPublicKey(): string {
  return vapidPublicKey;
}

export function isPushEnabled(): boolean {
  return Boolean(vapidPublicKey && vapidPrivateKey);
}

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
}

/** Send a push notification to all subscriptions of a user. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  ensureConfigured();
  if (!configured) return;

  const subscriptions = await PushSubscription.find({ userId }).lean();
  if (subscriptions.length === 0) return;

  const notificationPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon ?? "/icon-192.png",
    badge: payload.badge ?? "/icon-192.png",
    url: payload.url ?? "/",
    tag: payload.tag ?? "ramnagar-eats",
  });

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          notificationPayload,
        );
      } catch (error: any) {
        // 404 or 410 = subscription expired/invalid — remove it.
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await PushSubscription.deleteOne({ endpoint: sub.endpoint }).catch(() => {});
        }
        throw error;
      }
    }),
  );

  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed > 0) {
    console.warn(`[push] ${failed}/${subscriptions.length} notifications failed for user ${userId}`);
  }
}
