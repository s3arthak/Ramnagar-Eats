import { Schema, model } from "mongoose";

const pointSchema = new Schema(
  {
    type: { type: String, enum: ["Point"], required: true },
    coordinates: { type: [Number], required: true }, // [longitude, latitude]
  },
  { _id: false },
);

const offerSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
  },
  { _id: false },
);

const restaurantSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User" },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, default: "", maxlength: 700 },
    phone: { type: String, trim: true },
    address: { type: String, default: "", maxlength: 300 },
    location: pointSchema,
    logo: String,
    coverImage: String,
    cuisines: { type: [String], default: [] },
    isOpen: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    isAcceptingOrders: { type: Boolean, default: true },
    openingTime: { type: String, default: "", trim: true }, // "HH:MM" 24h; empty = no fixed hours
    closingTime: { type: String, default: "", trim: true },
    isPureVeg: { type: Boolean, default: false },
    rating: { type: Number, default: 4, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0 },
    deliveryTimeMin: { type: Number, default: 20, min: 5 },
    deliveryTimeMax: { type: Number, default: 35, min: 5 },
    priceForTwo: { type: Number, default: 300, min: 0 },
    minOrder: { type: Number, default: 99, min: 0 },
    offers: { type: [offerSchema], default: [] },
  },
  { timestamps: true },
);

restaurantSchema.index({ location: "2dsphere" });
export const Restaurant = model("Restaurant", restaurantSchema);
