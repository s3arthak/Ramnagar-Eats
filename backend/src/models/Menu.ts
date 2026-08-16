import { Schema, model } from "mongoose";

const categorySchema = new Schema(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    name: { type: String, required: true, trim: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const customizationOptionSchema = new Schema(
  { name: { type: String, required: true, trim: true }, price: { type: Number, default: 0, min: 0 } },
  { _id: false },
);

const customizationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    required: { type: Boolean, default: false },
    options: { type: [customizationOptionSchema], default: [] },
  },
  { _id: false },
);

const menuItemSchema = new Schema(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    categoryId: { type: Schema.Types.ObjectId, ref: "MenuCategory", required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    price: { type: Number, required: true, min: 0 },
    image: String,
    isVeg: { type: Boolean, default: false },
    isAvailable: { type: Boolean, default: true },
    isPopular: { type: Boolean, default: false },
    isRecommended: { type: Boolean, default: false },
    prepTime: { type: Number, default: 15, min: 1, max: 120 }, // minutes to prepare
    customizations: { type: [customizationSchema], default: [] },
  },
  { timestamps: true },
);

menuItemSchema.index({ restaurantId: 1, isAvailable: 1 });

// Common lookup path: category → items, in stable order.
menuItemSchema.index({ categoryId: 1, name: 1 });

// Disallow two categories with the same name in one restaurant.
categorySchema.index({ restaurantId: 1, name: 1 }, { unique: true });

export const MenuCategory = model("MenuCategory", categorySchema);
export const MenuItem = model("MenuItem", menuItemSchema);
