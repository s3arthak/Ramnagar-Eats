import { Router } from "express";
import { z } from "zod";
import { authenticate, authorize, type AuthRequest } from "../../middleware/auth.js";
import { Feedback } from "../../models/Feedback.js";
import { MenuCategory, MenuItem } from "../../models/Menu.js";
import { Restaurant } from "../../models/Restaurant.js";
import { User } from "../../models/User.js";
import { getServiceArea } from "../../services/service-area.js";
import { restaurantAvailability } from "../../utils/availability.js";
import { haversineKm } from "../../utils/geo.js";
import { asyncHandler, badRequest, notFound, ok } from "../../utils/errors.js";

const router = Router();

const listSchema = z.object({
  lat: z.coerce.number().gte(-90).lte(90).optional(),
  lng: z.coerce.number().gte(-180).lte(180).optional(),
  q: z.string().trim().max(80).optional(),
  cuisines: z.string().trim().optional(),
  rating: z.coerce.number().gte(0).lte(5).optional(),
  veg: z.enum(["true", "false"]).optional(),
  deliveryTime: z.coerce.number().int().positive().max(180).optional(),
  price: z.coerce.number().int().positive().max(100000).optional(),
  sort: z.enum(["rating", "delivery_time", "relevance"]).default("relevance"),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(12),
});

const restaurantDto = (restaurant: any, lat?: number, lng?: number) => {
  const availability = restaurantAvailability(restaurant);
  const dto: Record<string, unknown> = {
    id: restaurant._id.toString(),
    name: restaurant.name,
    description: restaurant.description,
    address: restaurant.address,
    phone: restaurant.phone || undefined,
    location: restaurant.location?.coordinates?.length === 2 ? { lat: restaurant.location.coordinates[1], lng: restaurant.location.coordinates[0] } : undefined,
    logo: restaurant.logo,
    coverImage: restaurant.coverImage,
    cuisines: restaurant.cuisines,
    isOpen: restaurant.isOpen,
    isPureVeg: restaurant.isPureVeg,
    isAcceptingOrders: restaurant.isAcceptingOrders !== false,
    openingTime: restaurant.openingTime || undefined,
    closingTime: restaurant.closingTime || undefined,
    availability,
    rating: restaurant.rating,
    ratingCount: restaurant.ratingCount,
    deliveryTimeMin: restaurant.deliveryTimeMin,
    deliveryTimeMax: restaurant.deliveryTimeMax,
    priceForTwo: restaurant.priceForTwo,
    minOrder: restaurant.minOrder,
    offers: restaurant.offers ?? [],
  };
  if (lat !== undefined && lng !== undefined && restaurant.location?.coordinates) {
    dto.distanceKm = Math.round(haversineKm(lat, lng, restaurant.location.coordinates[1], restaurant.location.coordinates[0]) * 10) / 10;
  }
  return dto;
};

// ---- Public list ----

router.get(
  "/",
  asyncHandler(async (request, response) => {
    const parsed = listSchema.safeParse(request.query);
    if (!parsed.success) throw badRequest(parsed.error.issues[0].message, "VALIDATION_ERROR");
    const { lat, lng, q, cuisines, rating, veg, deliveryTime, price, sort, page, limit } = parsed.data;
    const start = (page - 1) * limit;

    const filter: Record<string, unknown> = { isActive: true };
    if (q) filter.$or = [{ name: { $regex: q, $options: "i" } }, { cuisines: { $regex: q, $options: "i" } }, { description: { $regex: q, $options: "i" } }];
    if (cuisines) filter.cuisines = { $in: cuisines.split(",").map((value) => value.trim()).filter(Boolean) };
    if (rating !== undefined) filter.rating = { $gte: rating };
    if (veg === "true") filter.isPureVeg = true;
    if (deliveryTime !== undefined) filter.deliveryTimeMax = { $lte: deliveryTime };
    if (price !== undefined) filter.priceForTwo = { $lte: price };

    // Hyperlocal rule, enforced in the database: with a location, only restaurants
    // inside the delivery area are candidates. $geoWithin uses the 2dsphere index,
    // so the radius filter never scans the whole collection. Restaurants without a
    // location are naturally excluded (they can't be distance-gated anyway).
    const radiusKm = lat !== undefined && lng !== undefined ? (await getServiceArea()).radiusKm : null;
    if (radiusKm !== null) {
      filter.location = { $geoWithin: { $centerSphere: [[lng, lat], radiusKm / 6371] } };
    }

    // Only the fields the DTO actually exposes — avoids dragging full documents
    // (including large offer/description text) through the hot list path.
    const projection = {
      name: 1, description: 1, address: 1, phone: 1, location: 1, logo: 1, coverImage: 1,
      cuisines: 1, isOpen: 1, isPureVeg: 1, isAcceptingOrders: 1, openingTime: 1, closingTime: 1,
      rating: 1, ratingCount: 1, deliveryTimeMin: 1, deliveryTimeMax: 1, priceForTwo: 1, minOrder: 1, offers: 1,
    };

    const [total, restaurants] = await (async () => {
      // Index-backed sorts: the DB orders + paginates, so only one page is ever loaded.
      if (sort !== "relevance") {
        const query = Restaurant.find(filter, projection);
        if (sort === "rating") query.sort({ rating: -1, ratingCount: -1 });
        else if (sort === "delivery_time") query.sort({ deliveryTimeMin: 1, deliveryTimeMax: 1 });
        const [count, documents] = await Promise.all([
          Restaurant.countDocuments(filter),
          query.skip(start).limit(limit).lean(),
        ]);
        return [count, documents.map((restaurant) => restaurantDto(restaurant, lat, lng))] as const;
      }
      // Default "relevance" sort is distance — distance must be computed before
      // sorting, so fetch the (radius-bounded) candidate set, then order in JS.
      const reference = lat !== undefined && lng !== undefined ? { lat, lng } : null;
      const [count, documents] = await Promise.all([Restaurant.countDocuments(filter), Restaurant.find(filter, projection).lean()]);
      documents.sort((a, b) => {
        if (!reference) return a.name.localeCompare(b.name);
        const aKm = a.location?.coordinates ? haversineKm(reference.lat, reference.lng, a.location.coordinates[1], a.location.coordinates[0]) : 999;
        const bKm = b.location?.coordinates ? haversineKm(reference.lat, reference.lng, b.location.coordinates[1], b.location.coordinates[0]) : 999;
        return aKm - bKm || a.name.localeCompare(b.name);
      });
      return [count, documents.slice(start, start + limit).map((restaurant) => restaurantDto(restaurant, lat, lng))] as const;
    })();

    return ok(response, { restaurants, total, page, limit, hasMore: start + restaurants.length < total });
  }),
);

// ---- Owner management (restaurant web app). Mounted on the /me prefix
// before the public /:restaurantId routes so /me is never captured as an id
// and the auth middleware only guards owner paths. ----

const ownerRouter = Router();
ownerRouter.use(authenticate, authorize("RESTAURANT"));

const restaurantSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().max(700).optional(),
  phone: z.string().min(8).max(20).optional(),
  address: z.string().max(300).optional(),
  cuisines: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
  isOpen: z.boolean().optional(),
  isAcceptingOrders: z.boolean().optional(),
  logo: z.string().max(400).refine((value) => /^(https?:\/\/|\/uploads\/)/.test(value), "Invalid image URL").optional().or(z.literal("")),
  coverImage: z.string().max(400).refine((value) => /^(https?:\/\/|\/uploads\/)/.test(value), "Invalid image URL").optional().or(z.literal("")),
  openingTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().or(z.literal("")),
  closingTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().or(z.literal("")),
  isPureVeg: z.boolean().optional(),
  priceForTwo: z.number().int().min(0).optional(),
  minOrder: z.number().int().min(0).optional(),
  deliveryTimeMin: z.number().int().min(5).optional(),
  deliveryTimeMax: z.number().int().min(5).optional(),
  location: z.object({ lat: z.number().gte(-90).lte(90), lng: z.number().gte(-180).lte(180) }).optional(),
});
const categorySchema = z.object({ name: z.string().trim().min(2).max(60), sortOrder: z.number().int().min(0).optional() });
const itemSchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  description: z.string().max(500).optional(),
  price: z.number().positive().max(100000),
  isVeg: z.boolean(), // food type is mandatory — every item is VEG or NON-VEG
  isAvailable: z.boolean().optional(),
  isPopular: z.boolean().optional(),
  isRecommended: z.boolean().optional(),
  prepTime: z.number().int().min(1).max(120).optional(),
  image: z.string().max(400).refine((value) => /^(https?:\/\/|\/uploads\/)/.test(value), "Invalid image URL").optional().or(z.literal("")),
  customizations: z
    .array(z.object({ name: z.string().trim().min(1).max(60), required: z.boolean().optional(), options: z.array(z.object({ name: z.string().trim().min(1).max(60), price: z.number().min(0) })) }))
    .max(5)
    .optional(),
});

async function currentRestaurant(request: AuthRequest) {
  return Restaurant.findOne({ ownerId: request.user!.id });
}

const ownerRestaurantDto = (restaurant: any) =>
  restaurant
    ? {
        id: restaurant._id.toString(),
        name: restaurant.name,
        description: restaurant.description ?? "",
        phone: restaurant.phone ?? "",
        address: restaurant.address ?? "",
        logo: restaurant.logo,
        coverImage: restaurant.coverImage,
        cuisines: restaurant.cuisines ?? [],
        isOpen: restaurant.isOpen,
        isAcceptingOrders: restaurant.isAcceptingOrders !== false,
        openingTime: restaurant.openingTime || "",
        closingTime: restaurant.closingTime || "",
        isPureVeg: restaurant.isPureVeg,
        priceForTwo: restaurant.priceForTwo,
        minOrder: restaurant.minOrder,
        deliveryTimeMin: restaurant.deliveryTimeMin,
        deliveryTimeMax: restaurant.deliveryTimeMax,
        offers: restaurant.offers ?? [],
        location: restaurant.location?.coordinates ? { lat: restaurant.location.coordinates[1], lng: restaurant.location.coordinates[0] } : null,
      }
    : null;

const ownerCategoryDto = (category: any) => ({ id: category._id.toString(), name: category.name, sortOrder: category.sortOrder });
const ownerItemDto = (item: any) => ({
  id: item._id.toString(),
  categoryId: item.categoryId.toString(),
  name: item.name,
  description: item.description ?? "",
  price: item.price,
  image: item.image,
  isVeg: item.isVeg,
  isAvailable: item.isAvailable,
  isPopular: item.isPopular,
  isRecommended: item.isRecommended ?? false,
  prepTime: item.prepTime ?? 15,
  customizations: item.customizations ?? [],
});

ownerRouter.get("/", asyncHandler(async (request: AuthRequest, response) => ok(response, { restaurant: ownerRestaurantDto(await currentRestaurant(request)) })));
ownerRouter.put(
  "/",
  asyncHandler(async (request: AuthRequest, response) => {
    const parsed = restaurantSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0].message, "VALIDATION_ERROR");
    const { location, ...data } = parsed.data;
    const restaurant = await Restaurant.findOneAndUpdate(
      { ownerId: request.user!.id },
      { $set: { ...data, ...(location ? { location: { type: "Point", coordinates: [location.lng, location.lat] } } : {}) }, $setOnInsert: { ownerId: request.user!.id } },
      { upsert: true, returnDocument: "after", runValidators: true },
    );
    return ok(response, { restaurant: ownerRestaurantDto(restaurant) });
  }),
);

ownerRouter.get("/categories", asyncHandler(async (request: AuthRequest, response) => {
  const restaurant = await currentRestaurant(request);
  const categories = restaurant ? await MenuCategory.find({ restaurantId: restaurant.id }).sort({ sortOrder: 1, name: 1 }) : [];
  return ok(response, { categories: categories.map(ownerCategoryDto) });
}));
ownerRouter.post("/categories", asyncHandler(async (request: AuthRequest, response) => {
  const parsed = categorySchema.safeParse(request.body);
  if (!parsed.success) throw badRequest(parsed.error.issues[0].message, "VALIDATION_ERROR");
  const restaurant = await currentRestaurant(request);
  if (!restaurant) throw badRequest("Complete your restaurant profile first", "RESTAURANT_PROFILE_REQUIRED");
  return ok(response, { category: ownerCategoryDto(await MenuCategory.create({ ...parsed.data, restaurantId: restaurant.id })) }, 201);
}));
ownerRouter.patch("/categories/:id", asyncHandler(async (request: AuthRequest, response) => {
  const parsed = categorySchema.partial().safeParse(request.body);
  if (!parsed.success) throw badRequest("Invalid category", "VALIDATION_ERROR");
  const restaurant = await currentRestaurant(request);
  const category = await MenuCategory.findOneAndUpdate({ _id: request.params.id, restaurantId: restaurant?.id }, parsed.data, { returnDocument: "after" });
  if (!category) throw notFound("Category not found");
  return ok(response, { category: ownerCategoryDto(category) });
}));
ownerRouter.delete("/categories/:id", asyncHandler(async (request: AuthRequest, response) => {
  const restaurant = await currentRestaurant(request);
  const category = await MenuCategory.findOneAndDelete({ _id: request.params.id, restaurantId: restaurant?.id });
  if (!category) throw notFound("Category not found");
  await MenuItem.deleteMany({ categoryId: category.id, restaurantId: restaurant!.id });
  return response.status(204).send();
}));

ownerRouter.get("/menu-items", asyncHandler(async (request: AuthRequest, response) => {
  const restaurant = await currentRestaurant(request);
  const items = restaurant ? await MenuItem.find({ restaurantId: restaurant.id }).sort({ createdAt: -1 }) : [];
  return ok(response, { items: items.map(ownerItemDto) });
}));
ownerRouter.post("/menu-items", asyncHandler(async (request: AuthRequest, response) => {
  const parsed = itemSchema.safeParse(request.body);
  if (!parsed.success) throw badRequest(parsed.error.issues[0].message, "VALIDATION_ERROR");
  const restaurant = await currentRestaurant(request);
  if (!restaurant) throw badRequest("Complete your restaurant profile first", "RESTAURANT_PROFILE_REQUIRED");
  const category = await MenuCategory.exists({ _id: parsed.data.categoryId, restaurantId: restaurant.id });
  if (!category) throw badRequest("Select one of your own categories", "VALIDATION_ERROR");
  return ok(response, { item: ownerItemDto(await MenuItem.create({ ...parsed.data, restaurantId: restaurant.id })) }, 201);
}));
ownerRouter.patch("/menu-items/:id", asyncHandler(async (request: AuthRequest, response) => {
  const parsed = itemSchema.partial().safeParse(request.body);
  if (!parsed.success) throw badRequest("Invalid menu item", "VALIDATION_ERROR");
  const restaurant = await currentRestaurant(request);
  const item = await MenuItem.findOneAndUpdate({ _id: request.params.id, restaurantId: restaurant?.id }, parsed.data, { returnDocument: "after", runValidators: true });
  if (!item) throw notFound("Menu item not found");
  return ok(response, { item: ownerItemDto(item) });
}));
ownerRouter.patch("/menu-items/:id/availability", asyncHandler(async (request: AuthRequest, response) => {
  const parsed = z.object({ isAvailable: z.boolean() }).safeParse(request.body);
  if (!parsed.success) throw badRequest("isAvailable must be a boolean", "VALIDATION_ERROR");
  const restaurant = await currentRestaurant(request);
  const item = await MenuItem.findOneAndUpdate({ _id: request.params.id, restaurantId: restaurant?.id }, { isAvailable: parsed.data.isAvailable }, { returnDocument: "after" });
  if (!item) throw notFound("Menu item not found");
  return ok(response, { item: ownerItemDto(item) });
}));
ownerRouter.delete("/menu-items/:id", asyncHandler(async (request: AuthRequest, response) => {
  const restaurant = await currentRestaurant(request);
  const item = await MenuItem.findOneAndDelete({ _id: request.params.id, restaurantId: restaurant?.id });
  if (!item) throw notFound("Menu item not found");
  return response.status(204).send();
}));

router.use("/me", ownerRouter);

// ---- Public detail + menu (registered after the owner router) ----

// ---- Public reviews (dynamic feedback per restaurant) ----

router.get(
  "/:restaurantId/reviews",
  asyncHandler(async (request, response) => {
    const restaurant = await Restaurant.findOne({ _id: request.params.restaurantId, isActive: true }).select("_id").lean();
    if (!restaurant) throw notFound("Restaurant not found");

    const [feedbacks, aggregate] = await Promise.all([
      Feedback.find({ restaurantId: restaurant._id }).sort({ createdAt: -1 }).limit(20).lean(),
      // Grouped per star in the DB — the summary never pulls every rating into memory.
      Feedback.aggregate([
        { $match: { restaurantId: restaurant._id } },
        { $group: { _id: "$rating", count: { $sum: 1 } } },
      ]),
    ]);

    const userIds = [...new Set(feedbacks.map((entry) => entry.userId.toString()))];
    const users = await User.find({ _id: { $in: userIds } }).select("name").lean();
    const nameBy = new Map(users.map((user) => [user._id.toString(), user.name]));

    const reviews = feedbacks.map((entry) => ({
      id: entry._id.toString(),
      rating: entry.rating,
      comment: entry.comment,
      name: nameBy.get(entry.userId.toString()) ?? "Verified customer",
      createdAt: entry.createdAt,
    }));

    const total = aggregate.reduce((sum, row) => sum + row.count, 0);
    const weighted = aggregate.reduce((sum, row) => sum + row._id * row.count, 0);
    const byStar = new Map(aggregate.map((row) => [row._id, row.count]));
    const summary = {
      average: total ? Math.round((weighted / total) * 10) / 10 : 0,
      count: total,
      breakdown: [5, 4, 3, 2, 1].map((star) => ({ star, count: byStar.get(star) ?? 0 })),
    };

    return ok(response, { reviews, summary });
  }),
);

router.get(
  "/:restaurantId",
  asyncHandler(async (request, response) => {
    const parsed = z.object({ lat: z.coerce.number().gte(-90).lte(90).optional(), lng: z.coerce.number().gte(-180).lte(180).optional() }).safeParse(request.query);
    const restaurant = await Restaurant.findOne({ _id: request.params.restaurantId, isActive: true }).lean();
    if (!restaurant) throw notFound("Restaurant not found");
    return ok(response, { restaurant: restaurantDto(restaurant, parsed.success ? parsed.data.lat : undefined, parsed.success ? parsed.data.lng : undefined) });
  }),
);

router.get(
  "/:restaurantId/menu",
  asyncHandler(async (request, response) => {
    const restaurant = await Restaurant.findOne({ _id: request.params.restaurantId, isActive: true })
      .select("name description cuisines phone location isActive isOpen isAcceptingOrders openingTime closingTime isPureVeg coverImage logo rating ratingCount deliveryTimeMin deliveryTimeMax priceForTwo minOrder offers")
      .lean();
    if (!restaurant) throw notFound("Restaurant not found");
    const [categories, items] = await Promise.all([
      MenuCategory.find({ restaurantId: restaurant._id }).sort({ sortOrder: 1, name: 1 }).lean(),
      MenuItem.find({ restaurantId: restaurant._id }).sort({ createdAt: 1 }).lean(),
    ]);
    // Single pass to bucket items by category instead of filtering per category.
    const itemsByCategory = new Map<string, typeof items>();
    for (const item of items) {
      const key = item.categoryId.toString();
      const bucket = itemsByCategory.get(key);
      if (bucket) bucket.push(item);
      else itemsByCategory.set(key, [item]);
    }
    const grouped = categories.map((category) => ({
      id: category._id.toString(),
      name: category.name,
      sortOrder: category.sortOrder,
      items: (itemsByCategory.get(category._id.toString()) ?? []).map((item) => ({
        id: item._id.toString(),
        name: item.name,
        description: item.description,
        price: item.price,
        image: item.image,
        isVeg: item.isVeg,
        isAvailable: item.isAvailable,
        isPopular: item.isPopular,
        isRecommended: item.isRecommended ?? false,
        prepTime: item.prepTime ?? 15,
        customizations: item.customizations ?? [],
      })),
    }));
    return ok(response, { restaurant: restaurantDto(restaurant), categories: grouped });
  }),
);

export default router;
