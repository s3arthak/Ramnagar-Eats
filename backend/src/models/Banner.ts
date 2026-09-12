import { Schema, model } from "mongoose";

/**
 * Promotional banner for the customer home carousel.
 * Managed by admins from the restaurant-web admin panel.
 */
const bannerSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 60 },
    subtitle: { type: String, trim: true, maxlength: 120, default: "" },
    ctaLabel: { type: String, trim: true, maxlength: 24, default: "ORDER NOW" },
    ctaLink: { type: String, trim: true, maxlength: 300, default: "/restaurants" },
    image: { type: String, trim: true, default: "" },
    /** Theme used by the customer app: "purple" | "orange" | "green" | "dark" */
    theme: { type: String, enum: ["purple", "orange", "green", "dark"], default: "purple" },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

bannerSchema.index({ isActive: 1, sortOrder: 1 });
export const Banner = model("Banner", bannerSchema);
