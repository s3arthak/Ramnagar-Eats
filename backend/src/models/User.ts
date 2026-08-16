import { Schema, model } from "mongoose";

export type UserRole = "CUSTOMER" | "RESTAURANT" | "ADMIN";

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    emailVerified: { type: Boolean, default: false },
    googleId: { type: String, trim: true },
    avatar: String,
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["CUSTOMER", "RESTAURANT", "ADMIN"], default: "CUSTOMER", required: true },
  },
  { timestamps: true },
);

userSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: "string" } } });
userSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: "string" } } });
userSchema.index({ googleId: 1 }, { unique: true, partialFilterExpression: { googleId: { $type: "string" } } });

export const User = model("User", userSchema);
