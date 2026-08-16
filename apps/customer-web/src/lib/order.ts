import type { OrderStatus } from "./types";

export const STATUS_LABELS: Record<OrderStatus, string> = {
  PLACED: "Order placed",
  CONFIRMED: "Restaurant confirmed",
  PREPARING: "Food preparing",
  READY: "Ready",
  PICKED_UP: "Picked up by delivery partner",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

export const TIMELINE: OrderStatus[] = ["PLACED", "CONFIRMED", "PREPARING", "READY", "PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED"];

/** Short labels used on the live tracker header / success screens. */
export const STATUS_SHORT: Record<OrderStatus, string> = {
  PLACED: "Order placed",
  CONFIRMED: "Confirmed",
  PREPARING: "Preparing",
  READY: "Ready",
  PICKED_UP: "Picked up",
  OUT_FOR_DELIVERY: "On the way",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

export function statusTone(status: OrderStatus): string {
  if (status === "CANCELLED") return "cancelled";
  if (status === "DELIVERED") return "delivered";
  if (status === "PLACED") return "new";
  return "preparing";
}

export function isActive(status: OrderStatus): boolean {
  return status !== "DELIVERED" && status !== "CANCELLED";
}

export function isCancelable(status: OrderStatus): boolean {
  return status === "PLACED" || status === "CONFIRMED";
}
