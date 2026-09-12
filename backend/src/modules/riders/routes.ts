import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { authenticate, authorize, signAccessToken, type AuthRequest } from "../../middleware/auth.js";
import { User, type RiderStatus } from "../../models/User.js";
import { Order, type OrderStatus } from "../../models/Order.js";
import { Restaurant } from "../../models/Restaurant.js";
import { sendPushToUser } from "../../services/push.js";
import { assertTransition, RIDER_TRANSITIONS } from "../../services/order-status.js";
import { getRoute } from "../../services/routing.js";
import { emitOrder, emitToUser, getIo } from "../../sockets/index.js";
import { orderDto } from "../../utils/order-dto.js";
import { haversineKm } from "../../utils/geo.js";
import { ApiError, asyncHandler, badRequest, notFound, ok } from "../../utils/errors.js";
import { normalizePhone } from "../../utils/phone.js";

const router = Router();

// ── Profile setup (first-time rider) — before role check so new riders can complete it ──
router.use(authenticate);

// ── Profile setup (first-time rider) ─────────────────────────────────────────

const setupSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
  phone: z.string().min(7).max(20).optional().or(z.literal("")),
  vehicleType: z.string().trim().min(1, "Vehicle type is required").max(40),
  vehicleNumber: z.string().trim().min(1, "Vehicle number is required").max(20),
  deliveryArea: z.string().trim().min(1, "Delivery area is required").max(100),
});

router.post(
  "/setup",
  asyncHandler(async (request: AuthRequest, response) => {
    const parsed = setupSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0].message, "VALIDATION_ERROR");
    const { name, vehicleType, vehicleNumber, deliveryArea } = parsed.data;
    let phone: string | undefined;
    if (parsed.data.phone?.trim()) {
      try {
        phone = normalizePhone(parsed.data.phone);
      } catch (caught) {
        throw badRequest(caught instanceof Error ? caught.message : "Enter a valid phone number", "VALIDATION_ERROR");
      }
    }
    const update: Record<string, unknown> = {
      name: name.trim(),
      vehicleType: vehicleType.trim(),
      vehicleNumber: vehicleNumber.trim(),
      deliveryArea: deliveryArea.trim(),
      role: "RIDER",
    };
    if (phone) update.phone = phone;
    const user = await User.findByIdAndUpdate(request.user!.id, update, { returnDocument: "after", runValidators: true }).select(
      "name phone email role avatar riderStatus riderApproval vehicleType vehicleNumber deliveryArea",
    );
    if (!user) throw notFound("Account not found", "ACCOUNT_NOT_FOUND");
    // Issue a fresh token with the correct RIDER role
    const token = signAccessToken(user.id, user.role as any);
    return ok(response, { user: riderPublicUser(user), token });
  }),
);

// ── Profile read — needs auth and RIDER role ──
router.get(
  "/me",
  asyncHandler(async (request: AuthRequest, response) => {
    if (request.user!.role !== "RIDER") throw new ApiError(403, "Insufficient permissions", "FORBIDDEN");
    const user = await User.findById(request.user!.id).select(
      "name phone email role avatar riderStatus riderApproval vehicleType vehicleNumber deliveryArea todayDeliveries todayEarnings lastActiveDate",
    );
    if (!user) throw notFound("Account not found", "ACCOUNT_NOT_FOUND");
    // Reset daily counters if it's a new day.
    const today = new Date().toISOString().slice(0, 10);
    if (user.lastActiveDate !== today) {
      user.todayDeliveries = 0;
      user.todayEarnings = 0;
      user.lastActiveDate = today;
      await user.save();
    }
    return ok(response, { user: riderPublicUser(user) });
  }),
);

// ── Get nearby online riders (admin only) ─────────────────────────────────────

router.get(
  "/nearby",
  authorize("ADMIN"),
  asyncHandler(async (request: AuthRequest, response) => {
    const lat = Number(request.query.lat);
    const lng = Number(request.query.lng);
    if (isNaN(lat) || isNaN(lng)) throw badRequest("lat and lng are required", "VALIDATION_ERROR");

    const riders = await User.find({
      role: "RIDER",
      riderStatus: "ONLINE",
      riderApproval: "APPROVED",
      riderLocation: {
        $near: {
          $geometry: { type: "Point", coordinates: [lng, lat] },
          $maxDistance: 15000, // 15km
        },
      },
    }).select("name phone deliveryArea vehicleType riderLocation");

    return ok(response, { riders });
  }),
);

// ── All remaining routes require RIDER role ───────────────────────────────────
router.use(authorize("RIDER"));

// ── Delivery history ─────────────────────────────────────────────────────────
router.get(
  "/deliveries",
  asyncHandler(async (request: AuthRequest, response) => {
    const orders = await Order.find({ riderId: request.user!.id, status: "DELIVERED" })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("orderNumber restaurantName items total deliveryFee status createdAt");
    return ok(response, {
      deliveries: orders.map((o) => ({
        id: o._id.toString(),
        orderNumber: o.orderNumber,
        restaurantName: o.restaurantName,
        itemCount: o.items.length,
        total: o.total,
        deliveryFee: o.deliveryFee,
        deliveredAt: o.createdAt,
      })),
    });
  }),
);

const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: z.string().min(7).max(20).optional().or(z.literal("")),
  vehicleType: z.string().trim().min(1).max(40).optional(),
  vehicleNumber: z.string().trim().min(1).max(20).optional(),
  deliveryArea: z.string().trim().min(1).max(100).optional(),
});

router.patch(
  "/me",
  asyncHandler(async (request: AuthRequest, response) => {
    const parsed = updateProfileSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0].message, "VALIDATION_ERROR");
    const update: Record<string, unknown> = {};
    if (parsed.data.name) update.name = parsed.data.name.trim();
    if (parsed.data.vehicleType) update.vehicleType = parsed.data.vehicleType.trim();
    if (parsed.data.vehicleNumber) update.vehicleNumber = parsed.data.vehicleNumber.trim();
    if (parsed.data.deliveryArea) update.deliveryArea = parsed.data.deliveryArea.trim();
    if (parsed.data.phone !== undefined) {
      if (parsed.data.phone.trim()) {
        try {
          update.phone = normalizePhone(parsed.data.phone);
        } catch (caught) {
          throw badRequest(caught instanceof Error ? caught.message : "Enter a valid phone number", "VALIDATION_ERROR");
        }
      } else {
        update.phone = undefined;
      }
    }
    const user = await User.findByIdAndUpdate(request.user!.id, update, { returnDocument: "after", runValidators: true }).select(
      "name phone email role avatar riderStatus riderApproval vehicleType vehicleNumber deliveryArea",
    );
    if (!user) throw notFound("Account not found", "ACCOUNT_NOT_FOUND");
    return ok(response, { user: riderPublicUser(user) });
  }),
);

// ── Online / Offline toggle ───────────────────────────────────────────────────

const statusSchema = z.object({
  status: z.enum(["ONLINE", "OFFLINE"]),
});

router.post(
  "/status",
  asyncHandler(async (request: AuthRequest, response) => {
    const parsed = statusSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0].message, "VALIDATION_ERROR");

    const user = await User.findById(request.user!.id);
    if (!user) throw notFound("Account not found", "ACCOUNT_NOT_FOUND");
    if (user.riderApproval !== "APPROVED") {
      throw new ApiError(403, "Your account is not yet approved", "NOT_APPROVED");
    }
    if (user.riderStatus === "SUSPENDED") {
      throw new ApiError(403, "Your account is suspended", "SUSPENDED");
    }
    // Cannot go offline while on an active delivery.
    if (parsed.data.status === "OFFLINE" && user.currentOrderId) {
      throw new ApiError(409, "Complete your current delivery before going offline", "ACTIVE_DELIVERY");
    }
    user.riderStatus = parsed.data.status as RiderStatus;
    await user.save();
    return ok(response, { riderStatus: user.riderStatus });
  }),
);

// ── Active delivery ───────────────────────────────────────────────────────────

router.get(
  "/delivery/active",
  asyncHandler(async (request: AuthRequest, response) => {
    const user = await User.findById(request.user!.id).select("currentOrderId");
    if (!user?.currentOrderId) {
      return ok(response, { order: null });
    }
    const order = await Order.findById(user.currentOrderId).select(
      "orderNumber customerId restaurantId restaurantName items deliveryAddress subtotal deliveryFee discount total paymentMethod paymentStatus deliveryOtp riderId status createdAt estimatedDeliveryAt",
    );
    if (!order) {
      user.currentOrderId = undefined;
      await user.save();
      return ok(response, { order: null });
    }
    const restaurant = await Restaurant.findById(order.restaurantId).select("name location phone");
    const restaurantLocation =
      restaurant?.location?.coordinates?.length === 2
        ? { lat: restaurant.location.coordinates[1], lng: restaurant.location.coordinates[0] }
        : null;

    // Get route from restaurant to delivery
    let route = null;
    if (restaurantLocation && order.deliveryAddress?.latitude != null && order.deliveryAddress?.longitude != null) {
      const to = { lat: order.deliveryAddress.latitude, lng: order.deliveryAddress.longitude };
      try {
        route = await getRoute(restaurantLocation, to);
      } catch {
        // best-effort
      }
    }

    return ok(response, {
      order: {
        ...orderDto(order),
        restaurantLocation,
        restaurantPhone: restaurant?.phone ?? "",
        route,
      },
    });
  }),
);

// ── Delivery actions ──────────────────────────────────────────────────────────

// Accept a delivery assignment
router.post(
  "/delivery/:orderId/accept",
  asyncHandler(async (request: AuthRequest, response) => {
    const orderId = String(request.params.orderId);
    const userId = request.user!.id;

    const user = await User.findById(userId);
    if (!user) throw notFound("Account not found", "ACCOUNT_NOT_FOUND");
    if (user.riderApproval !== "APPROVED") throw new ApiError(403, "Account not approved", "NOT_APPROVED");
    if (user.riderStatus === "SUSPENDED") throw new ApiError(403, "Account suspended", "SUSPENDED");
    // Auto-assignment flags currentOrderId so the dashboard shows the delivery;
    // accepting the very same order is allowed (only a *different* active
    // delivery blocks acceptance).
    if (user.currentOrderId && user.currentOrderId.toString() !== orderId) {
      throw new ApiError(409, "You already have an active delivery", "ACTIVE_DELIVERY");
    }

    const order = await Order.findById(orderId);
    if (!order) throw notFound("Order not found", "ORDER_NOT_FOUND");
    if (order.riderId?.toString() !== userId) throw new ApiError(403, "This order is not assigned to you", "FORBIDDEN");
    if (order.status !== "RIDER_ASSIGNED") throw new ApiError(409, `Cannot accept order in status ${order.status}`, "INVALID_STATUS_TRANSITION");

    assertTransition(order.status, "RIDER_ACCEPTED", RIDER_TRANSITIONS);
    order.status = "RIDER_ACCEPTED";
    order.statusHistory.push({ status: "RIDER_ACCEPTED", at: new Date() });
    await order.save();

    // Update rider state
    user.currentOrderId = order._id;
    user.riderStatus = "BUSY";
    await user.save();

    try {
      emitOrder(getIo(), order, "order:updated");
      emitToUser(order.customerId.toString(), "order:updated", { order: orderDto(order) });
    } catch {
      /* sockets not initialized */
    }

    // Notify restaurant
    const restaurant = await Restaurant.findById(order.restaurantId).select("ownerId");
    if (restaurant?.ownerId) {
      void sendPushToUser(restaurant.ownerId.toString(), {
        title: "Rider accepted your order",
        body: `${order.orderNumber} — rider is on the way`,
        url: "/orders",
        tag: `order-${order.id}`,
      }).catch(() => undefined);
    }

    return ok(response, { order: orderDto(order) });
  }),
);

// Reject a delivery assignment (rider is free again)
router.post(
  "/delivery/:orderId/reject",
  asyncHandler(async (request: AuthRequest, response) => {
    const orderId = String(request.params.orderId);
    const userId = request.user!.id;

    const order = await Order.findById(orderId);
    if (!order) throw notFound("Order not found", "ORDER_NOT_FOUND");
    if (order.riderId?.toString() !== userId) throw new ApiError(403, "This order is not assigned to you", "FORBIDDEN");
    if (order.status !== "RIDER_ASSIGNED") throw new ApiError(409, `Cannot reject order in status ${order.status}`, "INVALID_STATUS_TRANSITION");

    // Reset order
    order.riderId = undefined;
    order.status = "READY"; // back to ready for reassignment
    order.statusHistory.push({ status: "READY", at: new Date() });
    await order.save();

    // Rider stays online (not busy)
    const user = await User.findById(userId);
    if (user) {
      user.currentOrderId = undefined;
      user.riderStatus = "ONLINE";
      await user.save();
    }

    try {
      emitOrder(getIo(), order, "order:updated");
    } catch {
      /* sockets not initialized */
    }

    return ok(response, { message: "Delivery rejected" });
  }),
);

// Mark: Arrived at restaurant
router.post(
  "/delivery/:orderId/arrived",
  asyncHandler(async (request: AuthRequest, response) => {
    const order = await validateRiderOrder(request.user!.id, String(request.params.orderId), "RIDER_ACCEPTED");
    // No state change — just a notification. Rider is on their way.
    const restaurant = await Restaurant.findById(order.restaurantId).select("ownerId name");
    if (restaurant?.ownerId) {
      void sendPushToUser(restaurant.ownerId.toString(), {
        title: "Rider is arriving",
        body: `Rider is at ${restaurant.name} for order ${order.orderNumber}`,
        url: "/orders",
        tag: `order-${order.id}`,
      }).catch(() => undefined);
    }
    return ok(response, { message: "Arrival noted" });
  }),
);

// Mark: Picked up from restaurant
router.post(
  "/delivery/:orderId/pickup",
  asyncHandler(async (request: AuthRequest, response) => {
    const order = await validateRiderOrder(request.user!.id, String(request.params.orderId), "RIDER_ACCEPTED");
    assertTransition(order.status, "PICKED_UP", RIDER_TRANSITIONS);
    order.status = "PICKED_UP";
    order.statusHistory.push({ status: "PICKED_UP", at: new Date() });
    await order.save();

    try {
      emitOrder(getIo(), order, "order:updated");
      emitToUser(order.customerId.toString(), "order:updated", { order: orderDto(order) });
    } catch {
      /* sockets not initialized */
    }

    // Notify customer
    void sendPushToUser(order.customerId.toString(), {
      title: "Order picked up",
      body: `${order.orderNumber} is on its way to you!`,
      url: `/orders/${order.id}`,
      tag: `order-${order.id}`,
    }).catch(() => undefined);

    // Generate delivery OTP for verification
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    order.deliveryOtp = otp;
    await order.save();

    return ok(response, { order: orderDto(order), deliveryOtp: otp });
  }),
);

// Mark: Out for delivery
router.post(
  "/delivery/:orderId/start-delivery",
  asyncHandler(async (request: AuthRequest, response) => {
    const order = await validateRiderOrder(request.user!.id, String(request.params.orderId), "PICKED_UP");
    assertTransition(order.status, "OUT_FOR_DELIVERY", RIDER_TRANSITIONS);
    order.status = "OUT_FOR_DELIVERY";
    order.statusHistory.push({ status: "OUT_FOR_DELIVERY", at: new Date() });
    await order.save();

    try {
      emitOrder(getIo(), order, "order:updated");
      emitToUser(order.customerId.toString(), "order:updated", { order: orderDto(order) });
    } catch {
      /* sockets not initialized */
    }

    void sendPushToUser(order.customerId.toString(), {
      title: "Rider is on the way",
      body: `${order.orderNumber} — your food is coming!`,
      url: `/orders/${order.id}`,
      tag: `order-${order.id}`,
    }).catch(() => undefined);

    return ok(response, { order: orderDto(order) });
  }),
);

// Mark: Delivered (with OTP verification)
const deliverSchema = z.object({
  otp: z.string().regex(/^\d{6}$/, "Enter the 6-digit OTP"),
});

router.post(
  "/delivery/:orderId/deliver",
  asyncHandler(async (request: AuthRequest, response) => {
    const parsed = deliverSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest("Enter the 6-digit delivery OTP", "VALIDATION_ERROR");

    const order = await validateRiderOrder(request.user!.id, String(request.params.orderId), "OUT_FOR_DELIVERY");
    if (!order.deliveryOtp) throw new ApiError(409, "No delivery OTP found", "NO_OTP");
    if (order.deliveryOtp !== parsed.data.otp) throw new ApiError(403, "Invalid OTP", "INVALID_OTP");

    assertTransition(order.status, "DELIVERED", RIDER_TRANSITIONS);
    order.status = "DELIVERED";
    order.statusHistory.push({ status: "DELIVERED", at: new Date() });
    order.deliveryVerified = true;
    await order.save();

    // Update rider state
    const user = await User.findById(request.user!.id);
    if (user) {
      user.currentOrderId = undefined;
      user.riderStatus = "ONLINE";
      user.todayDeliveries = (user.todayDeliveries ?? 0) + 1;
      user.todayEarnings = (user.todayEarnings ?? 0) + order.deliveryFee;
      user.lastActiveDate = new Date().toISOString().slice(0, 10);
      await user.save();
    }

    try {
      emitOrder(getIo(), order, "order:updated");
      emitToUser(order.customerId.toString(), "order:updated", { order: orderDto(order) });
    } catch {
      /* sockets not initialized */
    }

    void sendPushToUser(order.customerId.toString(), {
      title: "Order delivered! 🎉",
      body: `${order.orderNumber} has been delivered. Enjoy your meal!`,
      url: `/orders/${order.id}`,
      tag: `order-${order.id}`,
    }).catch(() => undefined);

    return ok(response, { order: orderDto(order), message: "Delivery completed" });
  }),
);

// ── Location update ───────────────────────────────────────────────────────────

const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).optional(),
  heading: z.number().min(0).max(360).optional(),
  speed: z.number().min(0).optional(),
});

router.post(
  "/location",
  asyncHandler(async (request: AuthRequest, response) => {
    const parsed = locationSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest("Invalid location data", "VALIDATION_ERROR");

    const { latitude, longitude, accuracy, heading, speed } = parsed.data;
    const user = await User.findById(request.user!.id);
    if (!user) throw notFound("Account not found", "ACCOUNT_NOT_FOUND");

    // Update rider location
    user.riderLocation = { type: "Point", coordinates: [longitude, latitude] };
    user.riderLocationUpdatedAt = new Date();
    await user.save();

    // Broadcast to customers with active orders assigned to this rider
    if (user.currentOrderId) {
      const order = await Order.findById(user.currentOrderId).select("customerId status");
      if (order && ["RIDER_ACCEPTED", "PICKED_UP", "OUT_FOR_DELIVERY"].includes(order.status)) {
        try {
          emitToUser(order.customerId.toString(), "rider:location", {
            orderId: user.currentOrderId,
            latitude,
            longitude,
            accuracy,
            heading,
            speed,
            updatedAt: new Date().toISOString(),
          });
        } catch {
          /* sockets not initialized */
        }
      }
    }

    return ok(response, { received: true });
  }),
);

// ── Get rider route for active delivery ───────────────────────────────────────

router.get(
  "/delivery/route",
  asyncHandler(async (request: AuthRequest, response) => {
    const user = await User.findById(request.user!.id).select("currentOrderId riderLocation");
    if (!user?.currentOrderId) {
      return ok(response, { route: null });
    }
    const order = await Order.findById(user.currentOrderId).select("status deliveryAddress restaurantId");
    if (!order) {
      return ok(response, { route: null });
    }

    const restaurant = await Restaurant.findById(order.restaurantId).select("location name");
    const restaurantLocation =
      restaurant?.location?.coordinates?.length === 2
        ? { lat: restaurant.location.coordinates[1], lng: restaurant.location.coordinates[0] }
        : null;
    const deliveryLocation =
      order.deliveryAddress?.latitude != null && order.deliveryAddress?.longitude != null
        ? { lat: order.deliveryAddress.latitude, lng: order.deliveryAddress.longitude }
        : null;

    if (!restaurantLocation || !deliveryLocation) {
      return ok(response, { route: null });
    }

    // Route depends on status: before pickup → restaurant, after pickup → customer
    const needsToRestaurant = ["RIDER_ASSIGNED", "RIDER_ACCEPTED"].includes(order.status);
    const from = needsToRestaurant ? (user.riderLocation?.coordinates?.length === 2
      ? { lat: user.riderLocation.coordinates[1], lng: user.riderLocation.coordinates[0] }
      : restaurantLocation) : restaurantLocation;
    const to = needsToRestaurant ? restaurantLocation : deliveryLocation;

    const route = await getRoute(from, to);
    const distanceKm = Math.round((route.distanceMeters / 1000) * 10) / 10;
    const durationMinutes = Math.max(1, Math.ceil(route.durationSeconds / 60));

    return ok(response, {
      route,
      destination: needsToRestaurant ? "restaurant" : "customer",
      destinationName: needsToRestaurant ? restaurant?.name : order.deliveryAddress.formattedAddress,
      distanceKm,
      durationMinutes,
    });
  }),
);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function validateRiderOrder(riderId: string, orderId: string, requiredStatus: OrderStatus) {
  const order = await Order.findById(orderId);
  if (!order) throw notFound("Order not found", "ORDER_NOT_FOUND");
  if (order.riderId?.toString() !== riderId) throw new ApiError(403, "This order is not assigned to you", "FORBIDDEN");
  if (order.status !== requiredStatus) {
    throw new ApiError(409, `Expected order in status ${requiredStatus}, got ${order.status}`, "INVALID_STATUS_TRANSITION");
  }
  return order;
}

function riderPublicUser(user: any) {
  return {
    id: user._id?.toString?.() ?? user.id,
    name: user.name,
    phone: user.phone ?? undefined,
    email: user.email ?? undefined,
    role: user.role,
    avatar: user.avatar ?? undefined,
    riderStatus: user.riderStatus,
    riderApproval: user.riderApproval,
    vehicleType: user.vehicleType,
    vehicleNumber: user.vehicleNumber,
    deliveryArea: user.deliveryArea,
    todayDeliveries: user.todayDeliveries ?? 0,
    todayEarnings: user.todayEarnings ?? 0,
  };
}

export default router;
