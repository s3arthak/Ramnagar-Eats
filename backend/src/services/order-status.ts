import type { OrderStatus } from "../models/Order.js";
import { ApiError } from "../utils/errors.js";

/** Statuses a restaurant can move an order to, per current status. */
export const RESTAURANT_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PLACED: ["CONFIRMED", "CANCELLED"], // accept / reject
  CONFIRMED: ["PREPARING"],
  PREPARING: ["READY"],
  READY: ["READY", "RIDER_ASSIGNED"], // READY stays until rider is assigned
  RIDER_ASSIGNED: ["RIDER_ASSIGNED", "RIDER_ACCEPTED"],
  RIDER_ACCEPTED: ["PICKED_UP"],
  PICKED_UP: ["OUT_FOR_DELIVERY"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
  DELIVERY_FAILED: [],
};

/** Statuses a rider can move an order to, per current status. */
export const RIDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PLACED: [],
  CONFIRMED: [],
  PREPARING: [],
  READY: [],
  RIDER_ASSIGNED: ["RIDER_ACCEPTED"],
  RIDER_ACCEPTED: ["PICKED_UP"],
  PICKED_UP: ["OUT_FOR_DELIVERY"],
  OUT_FOR_DELIVERY: ["DELIVERED", "DELIVERY_FAILED"],
  DELIVERED: [],
  CANCELLED: [],
  DELIVERY_FAILED: [],
};

/** Statuses from which the customer may cancel. */
export const CUSTOMER_CANCELABLE: OrderStatus[] = ["PLACED", "CONFIRMED"];

export const TERMINAL_STATUSES: OrderStatus[] = ["DELIVERED", "CANCELLED", "DELIVERY_FAILED"];

export function assertTransition(current: OrderStatus, next: OrderStatus, allowed: Record<OrderStatus, OrderStatus[]>) {
  if (!allowed[current]?.includes(next)) {
    throw new ApiError(409, `Cannot change an order from ${current} to ${next}`, "INVALID_STATUS_TRANSITION");
  }
}
