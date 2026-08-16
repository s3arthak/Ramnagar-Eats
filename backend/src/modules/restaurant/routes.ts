import { Router } from "express";
import { z } from "zod";
import { authenticate, authorize, type AuthRequest } from "../../middleware/auth.js";
import { Order, ORDER_STATUSES, type OrderStatus } from "../../models/Order.js";
import { Restaurant } from "../../models/Restaurant.js";
import { User } from "../../models/User.js";
import { emailService } from "../../services/email.js";
import { assertTransition, RESTAURANT_TRANSITIONS } from "../../services/order-status.js";
import { emitOrder, getIo } from "../../sockets/index.js";
import { orderDto } from "../../utils/order-dto.js";
import { asyncHandler, badRequest, notFound, ok } from "../../utils/errors.js";

const router = Router();

async function ownedRestaurant(request: AuthRequest) {
  return Restaurant.findOne({ ownerId: request.user!.id });
}

router.use(authenticate, authorize("RESTAURANT"));

router.get(
  "/orders",
  asyncHandler(async (request: AuthRequest, response) => {
    const restaurant = await ownedRestaurant(request);
    if (!restaurant) throw badRequest("Complete your restaurant profile first", "RESTAURANT_PROFILE_REQUIRED");
    const orders = await Order.find({ restaurantId: restaurant.id }).sort({ createdAt: -1 }).limit(100);
    const customerIds = [...new Set(orders.map((order) => order.customerId.toString()))];
    const customers = await User.find({ _id: { $in: customerIds } }).select("name phone");
    const nameBy = new Map(customers.map((customer) => [customer._id.toString(), customer.name]));
    const phoneBy = new Map(customers.map((customer) => [customer._id.toString(), customer.phone]));
    return ok(response, {
      orders: orders.map((order) => ({
        ...orderDto(order),
        customerName: nameBy.get(order.customerId.toString()) ?? "Customer",
        customerPhone: phoneBy.get(order.customerId.toString()) ?? "",
      })),
    });
  }),
);

const statusSchema = z.object({ status: z.enum(ORDER_STATUSES) });

router.patch(
  "/orders/:orderId/status",
  asyncHandler(async (request: AuthRequest, response) => {
    const parsed = statusSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest("Invalid status", "VALIDATION_ERROR");
    const restaurant = await ownedRestaurant(request);
    if (!restaurant) throw badRequest("Complete your restaurant profile first", "RESTAURANT_PROFILE_REQUIRED");
    const order = await Order.findOne({ _id: request.params.orderId, restaurantId: restaurant.id });
    if (!order) throw notFound("Order not found", "ORDER_NOT_FOUND");
    assertTransition(order.status, parsed.data.status, RESTAURANT_TRANSITIONS);
    order.status = parsed.data.status as OrderStatus;
    order.statusHistory.push({ status: order.status, at: new Date() });
    await order.save();
    const customer = await User.findById(order.customerId).select("email");
    if (customer?.email) {
      void emailService.sendOrderStatus(customer.email, { orderNumber: order.orderNumber, orderId: order.id.toString(), status: order.status }).catch(() => undefined);
    }
    try {
      emitOrder(getIo(), order, "order:updated");
    } catch {
      /* sockets not initialized */
    }
    return ok(response, { order: orderDto(order) });
  }),
);

router.patch(
  "/status",
  asyncHandler(async (request: AuthRequest, response) => {
    const parsed = z.object({ isOpen: z.boolean() }).safeParse(request.body);
    if (!parsed.success) throw badRequest("isOpen must be a boolean", "VALIDATION_ERROR");
    const restaurant = await Restaurant.findOneAndUpdate({ ownerId: request.user!.id }, { isOpen: parsed.data.isOpen }, { returnDocument: "after" });
    if (!restaurant) throw badRequest("Complete your restaurant profile first", "RESTAURANT_PROFILE_REQUIRED");
    return ok(response, { restaurant: { id: restaurant.id.toString(), name: restaurant.name, isOpen: restaurant.isOpen } });
  }),
);

router.get(
  "/dashboard",
  asyncHandler(async (request: AuthRequest, response) => {
    const restaurant = await ownedRestaurant(request);
    if (!restaurant) throw badRequest("Complete your restaurant profile first", "RESTAURANT_PROFILE_REQUIRED");
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [todayOrders, pendingOrders, activeOrders, readyOrders, revenue, totalOrders, recentOrders] = await Promise.all([
      Order.countDocuments({ restaurantId: restaurant.id, createdAt: { $gte: todayStart } }),
      Order.countDocuments({ restaurantId: restaurant.id, status: { $in: ["PLACED", "CONFIRMED"] } }),
      Order.countDocuments({ restaurantId: restaurant.id, status: { $in: ["PREPARING", "READY", "PICKED_UP", "OUT_FOR_DELIVERY"] } }),
      Order.countDocuments({ restaurantId: restaurant.id, status: "READY" }),
      Order.aggregate([
        { $match: { restaurantId: restaurant._id, status: "DELIVERED", createdAt: { $gte: todayStart } } },
        { $group: { _id: null, total: { $sum: "$total" } } },
      ]),
      Order.countDocuments({ restaurantId: restaurant.id }),
      Order.find({ restaurantId: restaurant.id }).sort({ createdAt: -1 }).limit(8),
    ]);

    return ok(response, {
      restaurant: { id: restaurant.id.toString(), name: restaurant.name, isOpen: restaurant.isOpen },
      stats: {
        todayOrders,
        pendingOrders,
        activeOrders,
        readyOrders,
        todayRevenue: revenue[0]?.total ?? 0,
        totalOrders,
      },
      recentOrders: recentOrders.map(orderDto),
    });
  }),
);

export default router;
