import { Router } from "express";
import { z } from "zod";
import { authenticate, authorize, type AuthRequest } from "../../middleware/auth.js";
import { Order, ORDER_STATUSES } from "../../models/Order.js";
import { Restaurant } from "../../models/Restaurant.js";
import { User } from "../../models/User.js";
import { getServiceArea, updateServiceArea } from "../../services/service-area.js";
import { orderDto } from "../../utils/order-dto.js";
import { asyncHandler, badRequest, notFound, ok } from "../../utils/errors.js";

const router = Router();

router.use(authenticate, authorize("ADMIN"));

router.get(
  "/service-area",
  asyncHandler(async (_request, response) => {
    return ok(response, { serviceArea: await getServiceArea() });
  }),
);

router.patch(
  "/service-area",
  asyncHandler(async (request: AuthRequest, response) => {
    const parsed = z
      .object({
        lat: z.coerce.number().gte(-90).lte(90),
        lng: z.coerce.number().gte(-180).lte(180),
        radiusKm: z.coerce.number().min(1).max(50),
        address: z.string().trim().max(200).optional().default(""),
        pincode: z.string().trim().max(10).optional().default(""),
      })
      .safeParse(request.body);
    if (!parsed.success) throw badRequest("Invalid service area settings", "VALIDATION_ERROR");
    const serviceArea = await updateServiceArea(parsed.data, request.user!.id);
    return ok(response, { serviceArea, message: "Delivery area updated" });
  }),
);

router.get(
  "/restaurants",
  asyncHandler(async (_request, response) => {
    const restaurants = await Restaurant.find().sort({ createdAt: -1 }).populate("ownerId", "name phone email");
    return ok(response, {
      restaurants: restaurants.map((restaurant) => ({
        id: restaurant._id.toString(),
        name: restaurant.name,
        cuisines: restaurant.cuisines,
        isOpen: restaurant.isOpen,
        isActive: restaurant.isActive,
        rating: restaurant.rating,
        owner: restaurant.ownerId ? { name: (restaurant.ownerId as any).name, phone: (restaurant.ownerId as any).phone } : null,
        createdAt: restaurant.createdAt,
      })),
    });
  }),
);

router.patch(
  "/restaurants/:restaurantId",
  asyncHandler(async (request, response) => {
    const parsed = z.object({ isActive: z.boolean().optional(), isOpen: z.boolean().optional() }).safeParse(request.body);
    if (!parsed.success) throw badRequest("Invalid update", "VALIDATION_ERROR");
    const restaurant = await Restaurant.findByIdAndUpdate(request.params.restaurantId, parsed.data, { returnDocument: "after" });
    if (!restaurant) throw notFound("Restaurant not found", "RESTAURANT_NOT_FOUND");
    return ok(response, { restaurant: { id: restaurant._id.toString(), name: restaurant.name, isActive: restaurant.isActive, isOpen: restaurant.isOpen } });
  }),
);

router.get(
  "/users",
  asyncHandler(async (_request, response) => {
    const users = await User.find({ role: { $ne: "ADMIN" } }).sort({ createdAt: -1 }).limit(200);
    return ok(response, {
      users: users.map((user) => ({ id: user._id.toString(), name: user.name, phone: user.phone, email: user.email, role: user.role, createdAt: user.createdAt })),
    });
  }),
);

router.get(
  "/orders",
  asyncHandler(async (request, response) => {
    const parsed = z.object({ status: z.enum(ORDER_STATUSES).optional() }).safeParse(request.query);
    const filter: Record<string, unknown> = parsed.success && parsed.data.status ? { status: parsed.data.status } : {};
    const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(100);
    const customerIds = [...new Set(orders.map((order) => order.customerId.toString()))];
    const customers = await User.find({ _id: { $in: customerIds } }).select("name phone");
    const nameBy = new Map(customers.map((customer) => [customer._id.toString(), customer.name]));
    return ok(response, { orders: orders.map((order) => ({ ...orderDto(order), customerName: nameBy.get(order.customerId.toString()) ?? "Customer" })) });
  }),
);

router.get(
  "/orders/:orderId",
  asyncHandler(async (request, response) => {
    const order = await Order.findById(request.params.orderId);
    if (!order) throw notFound("Order not found", "ORDER_NOT_FOUND");
    const customer = await User.findById(order.customerId).select("name phone");
    return ok(response, { order: { ...orderDto(order), customerName: customer?.name ?? "Customer" } });
  }),
);

router.get(
  "/metrics",
  asyncHandler(async (_request, response) => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [totalOrders, todayOrders, activeOrders, restaurants, customers, revenue] = await Promise.all([
      Order.countDocuments({}),
      Order.countDocuments({ createdAt: { $gte: todayStart } }),
      Order.countDocuments({ status: { $in: ["PLACED", "CONFIRMED", "PREPARING", "READY", "PICKED_UP", "OUT_FOR_DELIVERY"] } }),
      Restaurant.countDocuments({ isActive: true }),
      User.countDocuments({ role: "CUSTOMER" }),
      Order.aggregate([{ $match: { status: "DELIVERED" } }, { $group: { _id: null, total: { $sum: "$total" } } }]),
    ]);
    return ok(response, {
      metrics: {
        totalOrders,
        todayOrders,
        activeOrders,
        restaurants,
        customers,
        revenue: revenue[0]?.total ?? 0,
      },
    });
  }),
);

export default router;
