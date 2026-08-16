import { Schema, model } from "mongoose";

const addressSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    label: { type: String, required: true, trim: true, enum: ["Home", "Work", "Other"] },
    formattedAddress: { type: String, required: true, trim: true, maxlength: 300 },
    pincode: { type: String, required: true, trim: true },
    city: { type: String, default: "", trim: true, maxlength: 80 },
    state: { type: String, default: "", trim: true, maxlength: 80 },
    locality: { type: String, default: "", trim: true, maxlength: 80 },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    deliveryInstructions: { type: String, default: "", maxlength: 200 },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const Address = model("Address", addressSchema);
