import mongoose, { Schema, type InferSchemaType } from "mongoose";

const pushSubscriptionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    endpoint: { type: String, required: true },
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
    userAgent: { type: String, default: "" },
  },
  { timestamps: true },
);

// One subscription per endpoint (browser+device combo).
pushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });

export type PushSubscriptionDocument = InferSchemaType<typeof pushSubscriptionSchema> & { _id: mongoose.Types.ObjectId };

export const PushSubscription = mongoose.model("PushSubscription", pushSubscriptionSchema);
