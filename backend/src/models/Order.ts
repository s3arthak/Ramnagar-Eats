import { Schema, model } from "mongoose";

export type OrderStatus = "PLACED" | "CONFIRMED" | "PREPARING" | "READY" | "PICKED_UP" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED";
export const ORDER_STATUSES: OrderStatus[] = ["PLACED", "CONFIRMED", "PREPARING", "READY", "PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"];

const orderItemSchema = new Schema(
  {
    itemId: { type: Schema.Types.ObjectId, ref: "MenuItem", required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 }, // unit price incl. customizations (snapshot)
    quantity: { type: Number, required: true, min: 1 },
    customizations: { type: [{ name: String, optionName: String, price: Number }], default: [] },
  },
  { _id: false },
);

const addressSnapshotSchema = new Schema(
  {
    label: String,
    formattedAddress: String,
    pincode: String,
    latitude: Number,
    longitude: Number,
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    customerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    restaurantName: { type: String, required: true },
    items: { type: [orderItemSchema], required: true },
    deliveryAddress: { type: addressSnapshotSchema, required: true },
    subtotal: { type: Number, required: true, min: 0 },
    deliveryFee: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    couponCode: String,
    note: { type: String, default: "", maxlength: 200 },
    paymentMethod: { type: String, enum: ["COD", "MOCK"], required: true },
    paymentStatus: { type: String, enum: ["PENDING", "PAID"], default: "PENDING" },
    paymentReference: String,
    status: { type: String, enum: ORDER_STATUSES, default: "PLACED", required: true },
    statusHistory: { type: [{ status: { type: String, enum: ORDER_STATUSES }, at: Date }], default: [] },
    idempotencyKey: String,
    estimatedDeliveryAt: Date,
  },
  { timestamps: true },
);

orderSchema.index({ customerId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } });
// Dashboard / queue queries: pending orders for a restaurant, newest first.
orderSchema.index({ restaurantId: 1, status: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });

export const Order = model("Order", orderSchema);
