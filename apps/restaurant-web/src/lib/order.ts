import type { OrderStatus } from "./types";

export const STATUS_LABELS: Record<OrderStatus, string> = {
  PLACED: "New",
  CONFIRMED: "Accepted",
  PREPARING: "Preparing",
  READY: "Ready",
  RIDER_ASSIGNED: "Rider assigned",
  RIDER_ACCEPTED: "Rider on the way",
  PICKED_UP: "Picked up",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

export function statusTone(status: OrderStatus): string {
  if (status === "CANCELLED") return "cancelled";
  if (status === "DELIVERED") return "delivered";
  if (status === "PLACED") return "new";
  if (status === "RIDER_ASSIGNED" || status === "RIDER_ACCEPTED") return "preparing";
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
      return null; // waiting for rider auto-assignment
    case "RIDER_ASSIGNED":
      return null; // waiting for rider to accept
    case "RIDER_ACCEPTED":
      return null; // rider is heading to restaurant
    case "PICKED_UP":
      return null; // rider handles pickup + delivery
    case "OUT_FOR_DELIVERY":
      return null; // rider handles delivery
    default:
      return null;
  }
}
