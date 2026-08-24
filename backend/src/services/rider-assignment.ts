import { User } from "../models/User.js";
import { Order, type OrderStatus } from "../models/Order.js";
import { Restaurant } from "../models/Restaurant.js";
import { sendPushToUser } from "./push.js";
import { emitToUser } from "../sockets/index.js";
import { orderDto } from "../utils/order-dto.js";

/**
 * When an order reaches READY status, try to find an eligible rider and assign them.
 * Assignment is best-effort — failures never break the order flow.
 */
export async function assignRiderToOrder(orderId: string): Promise<void> {
  try {
    const order = await Order.findById(orderId);
    if (!order || order.status !== "READY") return;
    if (order.riderId) return; // already assigned

    const restaurant = await Restaurant.findById(order.restaurantId).select("location name");
    const restaurantLocation =
      restaurant?.location?.coordinates?.length === 2
        ? { lat: restaurant.location.coordinates[1], lng: restaurant.location.coordinates[0] }
        : null;

    // Find eligible riders: online, approved, not currently on a delivery
    const query: Record<string, unknown> = {
      role: "RIDER",
      riderStatus: "ONLINE",
      riderApproval: "APPROVED",
      currentOrderId: { $exists: false },
    };

    let riders: any[];

    if (restaurantLocation) {
      // Prefer riders near the restaurant (within 15km)
      riders = await User.find({
        ...query,
        riderLocation: {
          $near: {
            $geometry: { type: "Point", coordinates: [restaurantLocation.lng, restaurantLocation.lat] },
            $maxDistance: 15000,
          },
        },
      })
        .limit(5)
        .select("_id name deliveryArea riderLocation");
    } else {
      // No restaurant location — just grab any online rider
      riders = await User.find(query).limit(5).select("_id name deliveryArea");
    }

    if (riders.length === 0) return; // no riders available

    // Simple selection: pick the first available rider (closest if geo-sorted)
    const selectedRider = riders[0];

    // Assign the rider
    order.riderId = selectedRider._id;
    order.status = "RIDER_ASSIGNED" as OrderStatus;
    order.statusHistory.push({ status: "RIDER_ASSIGNED", at: new Date() });
    await order.save();

    // Also set currentOrderId on the rider so their dashboard
    // immediately shows the delivery (instead of "Waiting for a delivery…")
    await User.findByIdAndUpdate(selectedRider._id, {
      $set: { currentOrderId: order._id, riderStatus: "BUSY" },
    });

    // Notify the rider via push and socket
    void sendPushToUser(selectedRider._id.toString(), {
      title: "New delivery assigned",
      body: `${order.orderNumber} — ${order.restaurantName} · ${order.items.length} item(s)`,
      url: "/delivery",
      tag: `order-${order.id}`,
    }).catch(() => undefined);

    try {
      emitToUser(selectedRider._id.toString(), "order:assigned", {
        order: orderDto(order),
      });
      emitToUser(selectedRider._id.toString(), "order:updated", {
        order: orderDto(order),
      });
    } catch {
      /* sockets not initialized */
    }
  } catch (error) {
    console.error("[rider-assignment] Failed to assign rider:", error);
  }
}
