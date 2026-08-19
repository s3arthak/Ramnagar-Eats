import { Schema, model } from "mongoose";

export type UserRole = "CUSTOMER" | "RESTAURANT" | "ADMIN" | "RIDER";

export type RiderStatus = "OFFLINE" | "ONLINE" | "BUSY" | "SUSPENDED";
export type RiderApproval = "PENDING" | "APPROVED" | "REJECTED";

const pointSchema = new Schema(
  {
    type: { type: String, enum: ["Point"], required: true },
    coordinates: { type: [Number], required: true }, // [longitude, latitude]
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    emailVerified: { type: Boolean, default: false },
    googleId: { type: String, trim: true },
    avatar: String,
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["CUSTOMER", "RESTAURANT", "ADMIN", "RIDER"], default: "CUSTOMER", required: true },
    // --- Rider-specific fields (only used when role = RIDER) ---
    riderStatus: { type: String, enum: ["OFFLINE", "ONLINE", "BUSY", "SUSPENDED"], default: "OFFLINE" },
    riderApproval: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], default: "PENDING" },
    vehicleType: { type: String, trim: true },
    vehicleNumber: { type: String, trim: true },
    deliveryArea: { type: String, trim: true },
    riderLocation: pointSchema,
    riderLocationUpdatedAt: Date,
    currentOrderId: { type: Schema.Types.ObjectId, ref: "Order" },
    todayDeliveries: { type: Number, default: 0 },
    todayEarnings: { type: Number, default: 0 },
    lastActiveDate: { type: String },
  },
  { timestamps: true },
);

// Compound unique indexes: same email/phone/googleId can exist with different roles.
userSchema.index({ phone: 1, role: 1 }, { unique: true, partialFilterExpression: { phone: { $type: "string" } } });
userSchema.index({ email: 1, role: 1 }, { unique: true, partialFilterExpression: { email: { $type: "string" } } });
userSchema.index({ googleId: 1, role: 1 }, { unique: true, partialFilterExpression: { googleId: { $type: "string" } } });
// Rider queries: online riders in a delivery area.
userSchema.index({ role: 1, riderStatus: 1, riderApproval: 1 });
userSchema.index({ riderLocation: "2dsphere" });

export const User = model("User", userSchema);
