import { Router } from "express";
import { z } from "zod";
import { authenticate, authorize, type AuthRequest } from "../../middleware/auth.js";
import { Banner } from "../../models/Banner.js";
import { Coupon } from "../../models/Coupon.js";
import { Order, ORDER_STATUSES } from "../../models/Order.js";
import { Restaurant } from "../../models/Restaurant.js";
import { User } from "../../models/User.js";
import { getServiceArea, updateServiceArea } from "../../services/service-area.js";
import { orderDto } from "../../utils/order-dto.js";
import { asyncHandler, badRequest, notFound, ok } from "../../utils/errors.js";

const router = Router();

router.use(authenticate, authorize("ADMIN"));

/* ===== Banner management (home-page carousel) ===== */

const bannerDto = (banner: any) => ({
  id: banner._id.toString(),
  title: banner.title,
  subtitle: banner.subtitle,
  ctaLabel: banner.ctaLabel,
  ctaLink: banner.ctaLink,
  image: banner.image,
  theme: banner.theme,
  sortOrder: banner.sortOrder,
  isActive: banner.isActive,
  createdAt: banner.createdAt,
});

const bannerSchema = z.object({
  title: z.string().trim().min(2, "Title must be at least 2 characters").max(60),
  subtitle: z.string().trim().max(120).optional().default(""),
  ctaLabel: z.string().trim().max(24).optional().default("ORDER NOW"),
  ctaLink: z.string().trim().max(300).optional().default("/restaurants"),
  image: z.string().trim().max(2000).optional().default(""),
  theme: z.enum(["purple", "orange", "green", "dark"]).optional().default("purple"),
  sortOrder: z.coerce.number().min(0).max(100).optional().default(0),
  isActive: z.boolean().optional().default(true),
});

router.get(
  "/banners",
  asyncHandler(async (_request, response) => {
    const banners = await Banner.find().sort({ sortOrder: 1, createdAt: -1 });
    return ok(response, { banners: banners.map(bannerDto) });
  }),
);

router.post(
  "/banners",
  asyncHandler(async (request, response) => {
    const parsed = bannerSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0].message, "VALIDATION_ERROR");
    const banner = await Banner.create(parsed.data);
    return ok(response, { banner: bannerDto(banner), message: "Banner created" }, 201);
  }),
);

router.patch(
  "/banners/:bannerId",
  asyncHandler(async (request, response) => {
    const parsed = bannerSchema.partial().safeParse(request.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0].message, "VALIDATION_ERROR");
    const banner = await Banner.findByIdAndUpdate(request.params.bannerId, parsed.data, { returnDocument: "after", runValidators: true });
    if (!banner) throw notFound("Banner not found", "BANNER_NOT_FOUND");
    return ok(response, { banner: bannerDto(banner), message: "Banner updated" });
  }),
);

router.delete(
  "/banners/:bannerId",
  asyncHandler(async (request, response) => {
    const banner = await Banner.findByIdAndDelete(request.params.bannerId);
    if (!banner) throw notFound("Banner not found", "BANNER_NOT_FOUND");
    return response.status(204).send();
  }),
);


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
        pincode: z.string().regex(/^\d{6}$/, "Enter a valid 6-digit pincode").optional().default(""),
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
      users: users.map((user) => ({ id: user._id.toString(), name: user.name, phone: user.phone, email: user.email, role: user.role, riderApproval: user.riderApproval, createdAt: user.createdAt })),
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

const couponSchema = z.object({
  code: z.string().trim().min(2, "Code must be at least 2 characters").max(20).transform((value) => value.toUpperCase()),
  description: z.string().trim().max(200).optional().default(""),
  discountType: z.enum(["PERCENT", "FLAT"]),
  discountValue: z.coerce.number().min(1, "Discount must be at least 1"),
  maxDiscount: z.coerce.number().min(0).optional(),
  minOrderValue: z.coerce.number().min(0).optional().default(0),
  restaurantIds: z.array(z.string()).optional().default([]),
  usageLimit: z.coerce.number().min(0).optional().default(0),
  perUserLimit: z.coerce.number().min(1).optional().default(1),
  validFrom: z.coerce.date().optional(),
  validUntil: z.coerce.date().optional(),
  isActive: z.boolean().optional().default(true),
});

const couponDto = (coupon: any) => ({
  id: coupon._id.toString(),
  code: coupon.code,
  description: coupon.description,
  discountType: coupon.discountType,
  discountValue: coupon.discountValue,
  maxDiscount: coupon.maxDiscount ?? null,
  minOrderValue: coupon.minOrderValue,
  restaurantIds: coupon.restaurantIds.map((id: any) => id.toString()),
  usageLimit: coupon.usageLimit,
  perUserLimit: coupon.perUserLimit,
  usedCount: coupon.usedCount,
  validFrom: coupon.validFrom,
  validUntil: coupon.validUntil,
  isActive: coupon.isActive,
  createdAt: coupon.createdAt,
});

router.get(
  "/coupons",
  asyncHandler(async (_request, response) => {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    return ok(response, { coupons: coupons.map(couponDto) });
  }),
);

router.post(
  "/coupons",
  asyncHandler(async (request, response) => {
    const parsed = couponSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0].message, "VALIDATION_ERROR");
    const existing = await Coupon.findOne({ code: parsed.data.code });
    if (existing) throw badRequest("A coupon with this code already exists", "COUPON_EXISTS");
    const coupon = await Coupon.create(parsed.data);
    return ok(response, { coupon: couponDto(coupon), message: "Coupon created" }, 201);
  }),
);

router.patch(
  "/coupons/:couponId",
  asyncHandler(async (request, response) => {
    const parsed = couponSchema.partial().safeParse(request.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0].message, "VALIDATION_ERROR");
    if (parsed.data.code) {
      const existing = await Coupon.findOne({ code: parsed.data.code, _id: { $ne: request.params.couponId } });
      if (existing) throw badRequest("A coupon with this code already exists", "COUPON_EXISTS");
    }
    const coupon = await Coupon.findByIdAndUpdate(request.params.couponId, parsed.data, { returnDocument: "after", runValidators: true });
    if (!coupon) throw notFound("Coupon not found", "COUPON_NOT_FOUND");
    return ok(response, { coupon: couponDto(coupon), message: "Coupon updated" });
  }),
);

router.delete(
  "/coupons/:couponId",
  asyncHandler(async (request, response) => {
    const coupon = await Coupon.findByIdAndDelete(request.params.couponId);
    if (!coupon) throw notFound("Coupon not found", "COUPON_NOT_FOUND");
    return response.status(204).send();
  }),
);

router.get(
  "/riders",
  asyncHandler(async (_request, response) => {
    const riders = await User.find({ role: "RIDER" }).sort({ createdAt: -1 });

    // Aggregate total deliveries and earnings per rider from delivered orders.
    const riderIds = riders.map((r) => r._id);
    const stats = await Order.aggregate([
      { $match: { riderId: { $in: riderIds }, status: "DELIVERED" } },
      { $group: { _id: "$riderId", totalDeliveries: { $sum: 1 }, totalEarnings: { $sum: "$deliveryFee" } } },
    ]);
    const statsByRider = new Map(stats.map((s) => [s._id.toString(), { totalDeliveries: s.totalDeliveries, totalEarnings: s.totalEarnings }]));

    return ok(response, {
      riders: riders.map((r) => {
        const riderStats = statsByRider.get(r._id.toString());
        return {
          id: r._id.toString(),
          name: r.name,
          phone: r.phone,
          email: r.email,
          riderStatus: r.riderStatus,
          riderApproval: r.riderApproval,
          vehicleType: r.vehicleType,
          vehicleNumber: r.vehicleNumber,
          deliveryArea: r.deliveryArea,
          todayDeliveries: r.todayDeliveries,
          todayEarnings: r.todayEarnings ?? 0,
          totalDeliveries: riderStats?.totalDeliveries ?? 0,
          totalEarnings: riderStats?.totalEarnings ?? 0,
          createdAt: r.createdAt,
        };
      }),
    });
  }),
);

router.patch(
  "/riders/:riderId",
  asyncHandler(async (request, response) => {
    const parsed = z.object({ riderApproval: z.enum(["APPROVED", "REJECTED"]) }).safeParse(request.body);
    if (!parsed.success) throw badRequest("riderApproval must be APPROVED or REJECTED", "VALIDATION_ERROR");
    const rider = await User.findOneAndUpdate(
      { _id: request.params.riderId, role: "RIDER" },
      { $set: { riderApproval: parsed.data.riderApproval } },
      { returnDocument: "after" },
    );
    if (!rider) throw notFound("Rider not found", "NOT_FOUND");
    return ok(response, { rider: { id: rider._id.toString(), name: rider.name, riderApproval: rider.riderApproval } });
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
