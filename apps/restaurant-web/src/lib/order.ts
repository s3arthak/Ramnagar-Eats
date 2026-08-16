import type { OrderStatus } from "./types";

export const STATUS_LABELS: Record<OrderStatus, string> = {
  PLACED: "New",
  CONFIRMED: "Accepted",
  PREPARING: "Preparing",
  READY: "Ready",
  PICKED_UP: "Picked up",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

export function statusTone(status: OrderStatus): string {
  if (status === "CANCELLED") return "cancelled";
  if (status === "DELIVERED") return "delivered";
  if (status === "PLACED") return "new";
  return "preparing";
}

/** The next action a restaurant can take, if any. */
export function nextAction(status: OrderStatus): { label: string; next: OrderStatus; tone?: "primary" | "danger" } | null {
  switch (status) {
    case "PLACED":
      return { label: "Accept order", next: "CONFIRMED" };
    case "CONFIRMED":
      return { label: "Start preparing", next: "PREPARING" };
    case "PREPARING":
      return { label: "Mark ready", next: "READY" };
    case "READY":
      return { label: "Mark picked up", next: "PICKED_UP" };
    case "PICKED_UP":
      return { label: "Out for delivery", next: "OUT_FOR_DELIVERY" };
    case "OUT_FOR_DELIVERY":
      return { label: "Mark delivered", next: "DELIVERED" };
    default:
      return null;
  }
}
