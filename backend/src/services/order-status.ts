import type { OrderStatus } from "../models/Order.js";
import { ApiError } from "../utils/errors.js";

/** Statuses a restaurant can move an order to, per current status. */
export const RESTAURANT_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PLACED: ["CONFIRMED", "CANCELLED"], // accept / reject
  CONFIRMED: ["PREPARING"],
  PREPARING: ["READY"],
  READY: ["PICKED_UP"],
  PICKED_UP: ["OUT_FOR_DELIVERY"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

/** Statuses from which the customer may cancel. */
export const CUSTOMER_CANCELABLE: OrderStatus[] = ["PLACED", "CONFIRMED"];

export const TERMINAL_STATUSES: OrderStatus[] = ["DELIVERED", "CANCELLED"];

export function assertTransition(current: OrderStatus, next: OrderStatus, allowed: Record<OrderStatus, OrderStatus[]>) {
  if (!allowed[current]?.includes(next)) {
    throw new ApiError(409, `Cannot change an order from ${current} to ${next}`, "INVALID_STATUS_TRANSITION");
  }
}
