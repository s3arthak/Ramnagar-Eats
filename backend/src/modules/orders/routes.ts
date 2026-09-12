import { Router } from "express";
import { z } from "zod";
import { config } from "../../config.js";
import { emailService } from "../../services/email.js";
import { sendPushToUser } from "../../services/push.js";
import { authenticate, authorize, type AuthRequest } from "../../middleware/auth.js";
import { Address } from "../../models/Address.js";
import { MenuItem } from "../../models/Menu.js";
import { Order, type OrderStatus } from "../../models/Order.js";
import { Restaurant } from "../../models/Restaurant.js";
import { User } from "../../models/User.js";
import { Coupon } from "../../models/Coupon.js";
import { Feedback } from "../../models/Feedback.js";
import { restaurantAvailability } from "../../utils/availability.js";
import { validateCoupon } from "../../services/coupon.js";
import { paymentService } from "../../services/payment.js";
import { assertTransition, CUSTOMER_CANCELABLE, RESTAURANT_TRANSITIONS } from "../../services/order-status.js";
import { getRoute, type RouteResult } from "../../services/routing.js";
import { emitOrder, getIo } from "../../sockets/index.js";
import { orderDto } from "../../utils/order-dto.js";
import { serviceability } from "../../utils/geo.js";
import { ApiError, asyncHandler, badRequest, notFound, ok } from "../../utils/errors.js";

const router = Router();

const createOrderSchema = z.object({
  restaurantId: z.string().min(1),
  items: z
    .array(
      z.object({
        itemId: z.string().min(1),
        quantity: z.number().int().min(1).max(50),
        customizations: z.array(z.object({ name: z.string().trim().min(1), optionName: z.string().trim().min(1) })).max(10).optional(),
      }),
    )
    .min(1, "Your cart is empty")
    .max(50),
  addressId: z.string().min(1),
  couponCode: z.string().trim().max(40).optional(),
  note: z.string().trim().max(200).optional(),
  paymentMethod: z.enum(["COD", "MOCK"]).default("COD"),
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
});

/** A customer may read their own order; a restaurant owner or admin may read orders for their scope. */
async function canReadOrder(request: AuthRequest, order: any) {
  if (request.user!.role === "CUSTOMER") return order.customerId.toString() === request.user!.id;
  if (request.user!.role === "ADMIN") return true;
  const restaurant = await Restaurant.findOne({ ownerId: request.user!.id });
  return restaurant !== null && order.restaurantId.toString() === restaurant.id.toString();
}

router.post(
  "/",
  authenticate,
  authorize("CUSTOMER"),
  asyncHandler(async (request: AuthRequest, response) => {
    const parsed = createOrderSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0].message, "VALIDATION_ERROR");
    const { restaurantId, items, addressId, couponCode, note, paymentMethod, idempotencyKey } = parsed.data;
    const userId = request.user!.id;

    // Duplicate submission guard: the same idempotency key returns the same order.
    if (idempotencyKey) {
      const existing = await Order.findOne({ customerId: userId, idempotencyKey });
      if (existing) return ok(response, { order: orderDto(existing), duplicate: true });
    }

    const [restaurant, address] = await Promise.all([
      Restaurant.findOne({ _id: restaurantId, isActive: true }),
      Address.findOne({ _id: addressId, userId }),
    ]);
    if (!restaurant) throw notFound("Restaurant not found", "RESTAURANT_NOT_FOUND");
    if (!address) throw badRequest("Choose a valid delivery address", "INVALID_ADDRESS");

    // Live availability check — the restaurant could have closed, stopped taking
    // orders, or hit its closing time since the menu was loaded.
    const availability = restaurantAvailability(restaurant);
    if (!availability.canOrder) {
      throw new ApiError(409, `This restaurant is not accepting orders right now (${availability.label.toLowerCase()}).`, "RESTAURANT_UNAVAILABLE");
    }

    // Hyperlocal rule, enforced server-side: the delivery address must be inside
    // the admin-configured service area — the frontend can never bypass this.
    const area = await serviceability(address.latitude, address.longitude);
    if (!area.serviceable) {
      throw new ApiError(409, "We're not delivering to this location yet. Your address is outside our delivery area.", "OUT_OF_SERVICE_AREA");
    }

    // Fetch the items from the DB — client prices are never trusted.
    const menuItems = await MenuItem.find({ _id: { $in: items.map((line) => line.itemId) }, restaurantId });
    const found = new Set(menuItems.map((item) => item.id.toString()));
    for (const line of items) {
      if (!found.has(line.itemId)) throw badRequest("Some items are not available at this restaurant", "INVALID_ITEMS");
    }

    const orderItems: { itemId: string; name: string; price: number; quantity: number; customizations: { name: string; optionName: string; price: number }[] }[] = [];
    let subtotal = 0;
    for (const line of items) {
      const menuItem = menuItems.find((item) => item.id.toString() === line.itemId)!;
      if (!menuItem.isAvailable) throw new ApiError(409, `"${menuItem.name}" is out of stock`, "ITEM_UNAVAILABLE");
      const customizations = (line.customizations ?? []).map((selection) => {
        const group = menuItem.customizations.find((candidate) => candidate.name === selection.name);
        if (!group) throw badRequest(`Invalid customization for "${menuItem.name}"`, "INVALID_CUSTOMIZATION");
        const option = group.options.find((candidate) => candidate.name === selection.optionName);
        if (!option) throw badRequest(`Invalid customization for "${menuItem.name}"`, "INVALID_CUSTOMIZATION");
        return { name: group.name, optionName: option.name, price: option.price };
      });
      const unitPrice = menuItem.price + customizations.reduce((sum, c) => sum + c.price, 0);
      subtotal += unitPrice * line.quantity;
      orderItems.push({ itemId: menuItem.id.toString(), name: menuItem.name, price: unitPrice, quantity: line.quantity, customizations });
    }

    if (restaurant.minOrder > 0 && subtotal < restaurant.minOrder) {
      throw new ApiError(409, `Minimum order for ${restaurant.name} is ${config.currency}${restaurant.minOrder}`, "MIN_ORDER_NOT_MET");
    }

    let discount = 0;
    let appliedCoupon: string | undefined;
    if (couponCode) {
      const result = await validateCoupon(couponCode, restaurantId, subtotal, userId);
      if (!result.valid) throw new ApiError(409, result.message ?? "Invalid coupon", "INVALID_COUPON");
      discount = result.discountAmount ?? 0;
      appliedCoupon = couponCode.toUpperCase();
    }

    const baseFee = config.service.baseDeliveryFee;
    const freeAbove = config.service.freeDeliveryAbove;
    const deliveryFee = freeAbove > 0 && subtotal >= freeAbove ? 0 : baseFee;
    const total = subtotal + deliveryFee - discount;

    const now = new Date();
    const orderNumber = `${config.orderPrefix}${now.getTime().toString().slice(-6)}${Math.floor(Math.random() * 900 + 100)}`;
    const payment = await paymentService(paymentMethod).createPayment({ amount: total, orderId: null, customerId: userId });

    const order = await Order.create({
      orderNumber,
      customerId: userId,
      restaurantId: restaurant._id,
      restaurantName: restaurant.name,
      items: orderItems,
      deliveryAddress: {
        label: address.label,
        formattedAddress: address.formattedAddress,
        pincode: address.pincode,
        latitude: address.latitude,
        longitude: address.longitude,
      },
      subtotal,
      deliveryFee,
      discount,
      total,
      couponCode: appliedCoupon,
      note: note ?? "",
      paymentMethod,
      paymentStatus: payment.status,
      paymentReference: payment.reference,
      status: "PLACED" as OrderStatus,
      statusHistory: [{ status: "PLACED", at: now }],
      idempotencyKey,
      estimatedDeliveryAt: new Date(now.getTime() + restaurant.deliveryTimeMax * 60_000),
    });

    if (appliedCoupon) {
      await Coupon.updateOne({ code: appliedCoupon }, { $inc: { usedCount: 1 }, $push: { usedByUserIds: userId } });
    }

    // Transactional email — failures must never fail the order.
    const customer = await User.findById(userId).select("email name");
    if (customer?.email) {
      void emailService.sendOrderConfirmation(customer.email, { orderNumber, restaurantName: restaurant.name, total, orderId: order.id.toString() }).catch(() => undefined);
    }
    // Push notification to the restaurant owner (fire-and-forget).
    if (restaurant.ownerId) {
      void sendPushToUser(restaurant.ownerId.toString(), {
        title: "New order!",
        body: `${orderNumber} — ${orderItems.length} item(s) · ${config.currency}${total}`,
        url: "/orders",
        tag: `order-${order.id}`,
      }).catch(() => undefined);
    }

    try {
      emitOrder(getIo(), order, "order:new");
      emitOrder(getIo(), order, "order:updated");
    } catch {
      /* sockets not initialized (e.g. tests without a server) */
    }

    return ok(response, { order: orderDto(order), duplicate: false }, 201);
  }),
);

router.get(
  "/",
  authenticate,
  authorize("CUSTOMER"),
  asyncHandler(async (request: AuthRequest, response) => {
    const orders = await Order.find({ customerId: request.user!.id }).sort({ createdAt: -1 }).limit(50);
    // Batch-fetch rider info for orders that have an assigned rider
    const riderIds = [...new Set(orders.filter((o) => o.riderId).map((o) => o.riderId!.toString()))];
    const riders = riderIds.length > 0 ? await User.find({ _id: { $in: riderIds } }).select("name phone") : [];
    const riderByName = new Map(riders.map((r) => [r._id.toString(), r.name]));
    const riderPhoneBy = new Map(riders.map((r) => [r._id.toString(), r.phone]));
    // Cover images for the order-history cards (batched, best-effort).
    const restaurantIds = [...new Set(orders.map((o) => o.restaurantId.toString()))];
    const coverDocs = restaurantIds.length > 0 ? await Restaurant.find({ _id: { $in: restaurantIds } }).select("coverImage logo").lean() : [];
    const coverBy = new Map(coverDocs.map((r) => [r._id.toString(), (r as any).coverImage || (r as any).logo || ""]));
    return ok(response, {
      orders: orders.map((o) => ({
        ...orderDto(o, o.riderId ? { name: riderByName.get(o.riderId.toString()) ?? "", phone: riderPhoneBy.get(o.riderId.toString()) ?? "" } : null),
        restaurantCover: coverBy.get(o.restaurantId.toString()) || undefined,
      })),
    });
  }),
);

router.patch(
  "/:orderId/cancel",
  authenticate,
  authorize("CUSTOMER"),
  asyncHandler(async (request: AuthRequest, response) => {
    const order = await Order.findOne({ _id: request.params.orderId, customerId: request.user!.id });
    if (!order) throw notFound("Order not found", "ORDER_NOT_FOUND");
    if (!CUSTOMER_CANCELABLE.includes(order.status)) {
      throw new ApiError(409, `This order can no longer be cancelled (${order.status})`, "INVALID_STATUS_TRANSITION");
    }
    assertTransition(order.status, "CANCELLED", RESTAURANT_TRANSITIONS);
    order.status = "CANCELLED";
    order.statusHistory.push({ status: "CANCELLED", at: new Date() });
    await order.save();
    const canceller = await User.findById(order.customerId).select("email");
    if (canceller?.email) {
      void emailService.sendOrderCancelled(canceller.email, { orderNumber: order.orderNumber, orderId: order.id.toString() }).catch(() => undefined);
    }
    try {
      emitOrder(getIo(), order, "order:updated");
    } catch {
      /* sockets not initialized */
    }
    return ok(response, { order: orderDto(order) });
  }),
);

router.get(
  "/:orderId",
  authenticate,
  asyncHandler(async (request: AuthRequest, response) => {
    const order = await Order.findById(request.params.orderId);
    if (!order || !(await canReadOrder(request, order))) throw notFound("Order not found", "ORDER_NOT_FOUND");
    // The customer sees their own feedback (if any) so the tracking page can
    // show "You rated this order" instead of the form.
    const feedback =
      request.user!.role === "CUSTOMER" ? await Feedback.findOne({ orderId: order._id }).lean() : null;
    // Include rider info so the customer can see who's delivering
    let riderInfo: { name?: string; phone?: string } | null = null;
    if (order.riderId) {
      const rider = await User.findById(order.riderId).select("name phone");
      if (rider) riderInfo = { name: rider.name, phone: rider.phone ?? undefined };
    }
    return ok(response, { order: orderDto(order, riderInfo), feedback: feedback ? { id: feedback._id.toString(), rating: feedback.rating, comment: feedback.comment } : null });
  }),
);

router.get(
  "/:orderId/route",
  authenticate,
  asyncHandler(async (request: AuthRequest, response) => {
    const order = await Order.findById(request.params.orderId);
    if (!order || !(await canReadOrder(request, order))) throw notFound("Order not found", "ORDER_NOT_FOUND");

    const restaurant = await Restaurant.findById(order.restaurantId).select("name location deliveryTimeMax phone");
    const to =
      order.deliveryAddress?.latitude != null && order.deliveryAddress?.longitude != null
        ? { lat: order.deliveryAddress.latitude, lng: order.deliveryAddress.longitude }
        : null;
    const from = restaurant?.location?.coordinates?.length === 2 ? { lat: restaurant.location.coordinates[1], lng: restaurant.location.coordinates[0] } : null;

    // Route is immutable for an order — compute once and cache it on the order document.
    let route: RouteResult | null = (order.route as RouteResult | null) ?? null;
    if (!route && from && to) {
      route = await getRoute(from, to);
      order.set("route", route);
      await order.save().catch(() => undefined); // best-effort cache; never fail the request
    }

    // Dynamic ETA: prep time (restaurant target) + route travel time, from placement.
    const prepMinutes = restaurant?.deliveryTimeMax ?? 30;
    const etaAt = route
      ? new Date(order.createdAt.getTime() + prepMinutes * 60_000 + route.durationSeconds * 1000)
      : (order.estimatedDeliveryAt ?? null);
    const etaMinutes = etaAt ? Math.max(1, Math.ceil((etaAt.getTime() - Date.now()) / 60_000)) : null;

    return ok(response, {
      restaurant: restaurant && from ? { id: restaurant.id.toString(), name: restaurant.name, phone: restaurant.phone ?? "", location: from } : null,
      delivery: { address: order.deliveryAddress, location: to },
      route,
      eta: etaAt
        ? {
            at: etaAt,
            minutes: etaMinutes,
            distanceKm: route ? Math.round((route.distanceMeters / 1000) * 10) / 10 : null,
          }
        : null,
    });
  }),
);

const feedbackSchema = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(500).optional() });

router.post(
  "/:orderId/feedback",
  authenticate,
  authorize("CUSTOMER"),
  asyncHandler(async (request: AuthRequest, response) => {
    const parsed = feedbackSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest("Rating must be between 1 and 5", "VALIDATION_ERROR");
    const order = await Order.findOne({ _id: request.params.orderId, customerId: request.user!.id });
    if (!order) throw notFound("Order not found", "ORDER_NOT_FOUND");
    if (order.status !== "DELIVERED") {
      throw new ApiError(409, "You can rate this order once it's delivered", "ORDER_NOT_DELIVERED");
    }
    const existing = await Feedback.findOne({ orderId: order._id });
    if (existing) throw new ApiError(409, "You already rated this order", "FEEDBACK_ALREADY_SUBMITTED");

    await Feedback.create({
      orderId: order._id,
      restaurantId: order.restaurantId,
      userId: order.customerId,
      rating: parsed.data.rating,
      comment: parsed.data.comment ?? "",
    });

    // Recompute the restaurant's rating from all feedback (snapshot stays on the order).
    const [aggregate, count] = await Promise.all([
      Feedback.aggregate([{ $match: { restaurantId: order.restaurantId } }, { $group: { _id: null, avg: { $avg: "$rating" } } }]),
      Feedback.countDocuments({ restaurantId: order.restaurantId }),
    ]);
    const previous = await Restaurant.findById(order.restaurantId).select("rating");
    const rating = aggregate[0] ? Math.round(aggregate[0].avg * 10) / 10 : (previous?.rating ?? 4);
    await Restaurant.updateOne({ _id: order.restaurantId }, { rating, ratingCount: count });

    return ok(response, { feedback: { orderId: order._id.toString(), rating: parsed.data.rating, comment: parsed.data.comment ?? "" }, message: "Thanks for rating this order" }, 201);
  }),
);

export default router;
