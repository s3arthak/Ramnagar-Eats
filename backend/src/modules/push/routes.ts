import { Router } from "express";
import { z } from "zod";
import { authenticate, type AuthRequest } from "../../middleware/auth.js";
import { PushSubscription } from "../../models/PushSubscription.js";
import { getVapidPublicKey, isPushEnabled } from "../../services/push.js";
import { asyncHandler, badRequest, ok } from "../../utils/errors.js";

const router = Router();

/** Get the VAPID public key so the browser can subscribe. */
router.get("/vapid-public-key", (_request, response) => {
  return ok(response, {
    publicKey: getVapidPublicKey(),
    enabled: isPushEnabled(),
  });
});

/** Subscribe to push notifications. */
router.post(
  "/subscribe",
  authenticate,
  asyncHandler(async (request: AuthRequest, response) => {
    const schema = z.object({
      endpoint: z.string().url(),
      p256dh: z.string().min(1),
      auth: z.string().min(1),
      userAgent: z.string().optional(),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) throw badRequest("Invalid subscription", "VALIDATION_ERROR");

    // Upsert: one record per endpoint.
    await PushSubscription.findOneAndUpdate(
      { endpoint: parsed.data.endpoint },
      {
        userId: request.user!.id,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.p256dh,
        auth: parsed.data.auth,
        userAgent: parsed.data.userAgent ?? "",
      },
      { upsert: true, runValidators: true },
    );

    return ok(response, { message: "Subscribed to push notifications" });
  }),
);

/** Unsubscribe from push notifications. */
router.post(
  "/unsubscribe",
  authenticate,
  asyncHandler(async (request: AuthRequest, response) => {
    const schema = z.object({ endpoint: z.string().url() });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) throw badRequest("endpoint is required", "VALIDATION_ERROR");

    await PushSubscription.deleteOne({ endpoint: parsed.data.endpoint });
    return ok(response, { message: "Unsubscribed" });
  }),
);

/** Check subscription status. */
router.get(
  "/status",
  authenticate,
  asyncHandler(async (request: AuthRequest, response) => {
    const count = await PushSubscription.countDocuments({ userId: request.user!.id });
    return ok(response, { subscribed: count > 0, count, enabled: isPushEnabled() });
  }),
);

export default router;
