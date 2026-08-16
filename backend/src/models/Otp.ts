import { Schema, model } from "mongoose";

const otpSchema = new Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true, index: true },
    /** scrypt hash of the OTP — plaintext codes are never stored. */
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0, min: 0 },
    expiresAt: { type: Date, required: true },
    consumed: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// One active code per email; sending a new one replaces the old.
otpSchema.index({ email: 1, createdAt: -1 });

export const Otp = model("Otp", otpSchema);
