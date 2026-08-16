import { Router } from "express";
import { z } from "zod";
import { authenticate, authorize, type AuthRequest } from "../../middleware/auth.js";
import { Coupon } from "../../models/Coupon.js";
import { validateCoupon } from "../../services/coupon.js";
import { asyncHandler, badRequest, ok } from "../../utils/errors.js";

const router = Router();

const validateSchema = z.object({
  code: z.string().trim().min(1).max(40),
  restaurantId: z.string().min(1),
  subtotal: z.number().min(0),
});

/** Active coupons the current customer can still use, optionally scoped to a restaurant. */
router.get(
  "/",
  authenticate,
  authorize("CUSTOMER"),
  asyncHandler(async (request: AuthRequest, response) => {
    const parsed = z.object({ restaurantId: z.string().min(1).optional() }).safeParse(request.query);
    const restaurantId = parsed.success && parsed.data.restaurantId ? parsed.data.restaurantId : undefined;
    const now = new Date();
    const coupons = await Coupon.find({
      isActive: true,
      validFrom: { $lte: now },
      validUntil: { $gte: now },
      ...(restaurantId ? { $or: [{ restaurantIds: { $size: 0 } }, { restaurantIds: restaurantId }] } : {}),
    })
      .sort({ minOrderValue: 1 })
      .limit(30);
    const available = coupons
      .filter((coupon) => {
        if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) return false;
        const userUses = coupon.usedByUserIds.filter((id) => id.toString() === request.user!.id).length;
        return userUses < coupon.perUserLimit;
      })
      .map((coupon) => ({
        code: coupon.code,
        description: coupon.description,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        minOrderValue: coupon.minOrderValue,
      }));
    return ok(response, { coupons: available });
  }),
);

router.post(
  "/validate",
  authenticate,
  authorize("CUSTOMER"),
  asyncHandler(async (request: AuthRequest, response) => {
    const parsed = validateSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0].message, "VALIDATION_ERROR");
    const result = await validateCoupon(parsed.data.code, parsed.data.restaurantId, parsed.data.subtotal, request.user!.id);
    return ok(response, { ...result });
  }),
);

export default router;
