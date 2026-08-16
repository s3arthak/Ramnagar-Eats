import { config } from "../config.js";
import { Coupon } from "../models/Coupon.js";

export interface CouponValidation {
  valid: boolean;
  message?: string;
  coupon?: {
    code: string;
    description: string;
    discountType: "PERCENT" | "FLAT";
    discountValue: number;
  };
  discountAmount?: number;
}

/** Validate a coupon against the real database. Never trusts client discounts. */
export async function validateCoupon(code: string, restaurantId: string, subtotal: number, userId: string): Promise<CouponValidation> {
  const coupon = await Coupon.findOne({ code: code.trim().toUpperCase(), isActive: true });
  if (!coupon) return { valid: false, message: "This coupon code is invalid" };

  const now = new Date();
  if (now < coupon.validFrom || now > coupon.validUntil) return { valid: false, message: "This coupon has expired" };
  if (subtotal < coupon.minOrderValue) {
    return { valid: false, message: `Add items worth ${config.currency}${coupon.minOrderValue} or more to use this coupon` };
  }
  if (coupon.restaurantIds.length > 0 && !coupon.restaurantIds.some((id) => id.toString() === restaurantId)) {
    return { valid: false, message: "This coupon is not valid for this restaurant" };
  }
  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
    return { valid: false, message: "This coupon has reached its usage limit" };
  }
  const userUses = coupon.usedByUserIds.filter((id) => id.toString() === userId).length;
  if (userUses >= coupon.perUserLimit) {
    return { valid: false, message: "You have already used this coupon" };
  }

  const rawDiscount = coupon.discountType === "PERCENT" ? Math.round((subtotal * coupon.discountValue) / 100) : coupon.discountValue;
  const discountAmount = Math.min(rawDiscount, coupon.maxDiscount ?? rawDiscount, subtotal);
  if (discountAmount <= 0) return { valid: false, message: "This coupon doesn't apply to your order" };

  return {
    valid: true,
    coupon: { code: coupon.code, description: coupon.description, discountType: coupon.discountType, discountValue: coupon.discountValue },
    discountAmount,
  };
}
