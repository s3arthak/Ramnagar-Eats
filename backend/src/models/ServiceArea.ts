import { Schema, model } from "mongoose";

/** Singleton document (key "default") holding the admin-configured delivery area. */
const serviceAreaSchema = new Schema(
  {
    key: { type: String, default: "default", unique: true },
    lat: { type: Number, required: true, min: -90, max: 90 },
    lng: { type: Number, required: true, min: -180, max: 180 },
    address: { type: String, default: "" },
    pincode: { type: String, default: "" },
    radiusKm: { type: Number, required: true, min: 1, max: 50 },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

export const ServiceArea = model("ServiceArea", serviceAreaSchema);
