import { Schema, model } from "mongoose";

const couponSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    description: { type: String, default: "" },
    discountType: { type: String, enum: ["PERCENT", "FLAT"], required: true },
    discountValue: { type: Number, required: true, min: 0 },
    maxDiscount: { type: Number, min: 0 },
    minOrderValue: { type: Number, default: 0, min: 0 },
    /** Empty array = valid for every restaurant. */
    restaurantIds: { type: [Schema.Types.ObjectId], ref: "Restaurant", default: [] },
    usageLimit: { type: Number, default: 0, min: 0 }, // 0 = unlimited
    perUserLimit: { type: Number, default: 1, min: 1 },
    usedCount: { type: Number, default: 0, min: 0 },
    usedByUserIds: { type: [Schema.Types.ObjectId], ref: "User", default: [] },
    validFrom: { type: Date, default: () => new Date(0) },
    validUntil: { type: Date, default: () => new Date("2100-01-01") },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Coupon = model("Coupon", couponSchema);
