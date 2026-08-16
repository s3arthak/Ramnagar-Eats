import "dotenv/config";
import mongoose from "mongoose";
import { Address } from "./models/Address.js";
import { Category } from "./models/Category.js";
import { Coupon } from "./models/Coupon.js";
import { MenuCategory, MenuItem } from "./models/Menu.js";
import { Order } from "./models/Order.js";
import { Restaurant } from "./models/Restaurant.js";
import { ServiceArea } from "./models/ServiceArea.js";
import { User } from "./models/User.js";
import { hashPassword } from "./utils/password.js";

const CENTER = { lat: Number(process.env.SERVICE_CENTER_LAT ?? 19.076), lng: Number(process.env.SERVICE_CENTER_LNG ?? 72.8777) };

type SeedItem = {
  name: string;
  price: number;
  description?: string;
  image?: string;
  veg?: boolean;
  popular?: boolean;
  recommended?: boolean;
  prepTime?: number;
  unavailable?: boolean;
  customizations?: { name: string; required?: boolean; options: { name: string; price: number }[] }[];
};
type SeedCategory = { name: string; items: SeedItem[] };
type SeedRestaurant = {
  name: string;
  description: string;
  cuisines: string[];
  rating: number;
  ratingCount: number;
  deliveryTimeMin: number;
  deliveryTimeMax: number;
  priceForTwo: number;
  isPureVeg?: boolean;
  isOpen?: boolean;
  isAcceptingOrders?: boolean;
  openingTime?: string;
  closingTime?: string;
  offers?: { title: string; description: string }[];
  offsetLat: number;
  offsetLng: number;
  categories: SeedCategory[];
};

const RESTAURANTS: SeedRestaurant[] = [
  {
    name: "Biryani Blues",
    description: "Slow-cooked dum biryanis and Mughlai classics, straight from the handi.",
    cuisines: ["Biryani", "Mughlai"],
    rating: 4.5, ratingCount: 1200, deliveryTimeMin: 25, deliveryTimeMax: 35, priceForTwo: 350,
    offers: [{ title: "20% OFF up to ₹100", description: "On orders above ₹249" }],
    offsetLat: 0.012, offsetLng: -0.008,
    categories: [
      { name: "Biryani", items: [
        { name: "Chicken Dum Biryani", price: 240, description: "Fragrant basmati layered with spiced chicken, sealed and slow-cooked.", veg: false, popular: true, recommended: true, prepTime: 20, customizations: [{ name: "Spice level", required: true, options: [{ name: "Mild", price: 0 }, { name: "Medium", price: 0 }, { name: "Extra spicy", price: 0 }] }, { name: "Add-ons", options: [{ name: "Extra chicken", price: 90 }, { name: "Extra raita", price: 30 }] }] },
        { name: "Mutton Dum Biryani", price: 320, description: "Tender mutton pieces, saffron rice and fried onions.", veg: false, popular: true, recommended: true, prepTime: 25 },
        { name: "Veg Dum Biryani", price: 200, description: "Garden vegetables and aromatic spices in dum style.", veg: true },
      ] },
      { name: "Starters", items: [
        { name: "Chicken 65", price: 190, description: "Fiery fried chicken with curry leaves.", veg: false, popular: true, recommended: true, prepTime: 12 },
        { name: "Paneer Tikka", price: 210, description: "Char-grilled cottage cheese, peppers and onions.", veg: true, recommended: true, prepTime: 12 },
      ] },
      { name: "Breads & Sides", items: [
        { name: "Butter Naan", price: 40, description: "Soft tandoor bread brushed with butter.", veg: true },
        { name: "Burani Raita", price: 60, description: "Cooled yogurt with roasted cumin.", veg: true },
      ] },
    ],
  },
  {
    name: "Pizza Roma",
    description: "Wood-fired Neapolitan pizzas with hand-stretched dough.",
    cuisines: ["Pizza", "Italian"],
    rating: 4.2, ratingCount: 860, deliveryTimeMin: 30, deliveryTimeMax: 40, priceForTwo: 500,
    offers: [{ title: "Free delivery", description: "On orders above ₹299" }],
    offsetLat: -0.015, offsetLng: 0.01,
    categories: [
      { name: "Pizzas", items: [
        { name: "Margherita", price: 249, description: "San Marzano tomatoes, fresh mozzarella, basil.", veg: true, popular: true, customizations: [{ name: "Cheese", required: false, options: [{ name: "Extra cheese", price: 60 }, { name: "Double cheese", price: 110 }] }] },
        { name: "Pepperoni Classic", price: 349, description: "Spicy pepperoni, mozzarella, oregano.", veg: false, popular: true },
        { name: "Farmhouse", price: 329, description: "Onions, capsicum, mushrooms, sweet corn.", veg: true },
        { name: "BBQ Chicken", price: 379, description: "Smoky BBQ chicken, red onions, cheese.", veg: false },
      ] },
      { name: "Sides", items: [
        { name: "Garlic Breadsticks", price: 149, description: "Oven-baked with garlic butter.", veg: true },
        { name: "Chicken Wings (6 pc)", price: 229, description: "Sticky barbecue glaze.", veg: false },
      ] },
    ],
  },
  {
    name: "Burger Barn",
    description: "Stacked smash burgers and crispy sides.",
    cuisines: ["Burgers", "American"],
    rating: 4.0, ratingCount: 540, deliveryTimeMin: 20, deliveryTimeMax: 30, priceForTwo: 250,
    offsetLat: 0.005, offsetLng: 0.02,
    categories: [
      { name: "Burgers", items: [
        { name: "Classic Smash Burger", price: 179, description: "Double smashed patty, cheddar, house sauce.", veg: false, popular: true },
        { name: "Crispy Veg Burger", price: 129, description: "Crunchy veg patty, lettuce, mayo.", veg: true },
        { name: "Peri Peri Chicken", price: 199, description: "Grilled chicken, peri peri glaze.", veg: false },
      ] },
      { name: "Sides & Shakes", items: [
        { name: "Salted Fries", price: 99, description: "Golden and crispy.", veg: true },
        { name: "Oreo Shake", price: 149, description: "Thick shake loaded with Oreo.", veg: true, popular: true },
      ] },
    ],
  },
  {
    name: "Spice Route",
    description: "North Indian and Chinese favourites done right.",
    cuisines: ["North Indian", "Chinese"],
    rating: 4.6, ratingCount: 1500, deliveryTimeMin: 25, deliveryTimeMax: 40, priceForTwo: 400,
    offers: [{ title: "Flat ₹75 OFF", description: "On orders above ₹399" }],
    offsetLat: -0.02, offsetLng: -0.015,
    categories: [
      { name: "Main Course", items: [
        { name: "Paneer Butter Masala", price: 260, description: "Cottage cheese in silky tomato-cashew gravy.", veg: true, popular: true },
        { name: "Butter Chicken", price: 320, description: "Tandoori chicken in rich makhani gravy.", veg: false, popular: true, customizations: [{ name: "Spice level", required: true, options: [{ name: "Mild", price: 0 }, { name: "Medium", price: 0 }, { name: "Spicy", price: 0 }] }] },
        { name: "Chilli Paneer", price: 240, description: "Indo-Chinese stir-fried paneer.", veg: true },
      ] },
      { name: "Chinese", items: [
        { name: "Veg Hakka Noodles", price: 180, description: "Wok-tossed noodles with vegetables.", veg: true },
        { name: "Chicken Fried Rice", price: 220, description: "Smoky rice with chicken and egg.", veg: false },
      ] },
      { name: "Breads", items: [
        { name: "Garlic Naan", price: 70, description: "Tandoor bread with garlic butter.", veg: true },
      ] },
    ],
  },
  {
    name: "Green Bowl",
    description: "Fresh salads, grain bowls and cold-pressed juices.",
    cuisines: ["Healthy", "Salads"],
    rating: 4.4, ratingCount: 420, deliveryTimeMin: 15, deliveryTimeMax: 25, priceForTwo: 300, isPureVeg: true,
    offsetLat: 0.025, offsetLng: 0.005,
    categories: [
      { name: "Bowls", items: [
        { name: "Quinoa Power Bowl", price: 280, description: "Quinoa, chickpeas, avocado, tahini.", veg: true, popular: true },
        { name: "Greek Salad Bowl", price: 240, description: "Feta, olives, cucumber, cherry tomatoes.", veg: true },
      ] },
      { name: "Juices", items: [
        { name: "Green Detox", price: 160, description: "Spinach, apple, cucumber, ginger.", veg: true },
        { name: "Beetroot Boost", price: 170, description: "Beetroot, carrot, orange.", veg: true },
      ] },
    ],
  },
  {
    name: "Sweet Tooth",
    description: "Cakes, pastries and desserts baked fresh daily.",
    cuisines: ["Desserts", "Bakery"],
    rating: 4.7, ratingCount: 980, deliveryTimeMin: 20, deliveryTimeMax: 30, priceForTwo: 200, isPureVeg: true,
    offsetLat: -0.005, offsetLng: -0.025,
    categories: [
      { name: "Cakes", items: [
        { name: "Belgian Chocolate Truffle", price: 320, description: "Rich dark chocolate layers.", veg: true, popular: true },
        { name: "Red Velvet Slice", price: 180, description: "Cream cheese frosting.", veg: true },
      ] },
      { name: "Desserts", items: [
        { name: "Tiramisu", price: 220, description: "Espresso-soaked ladyfingers.", veg: true, popular: true },
        { name: "Gulab Jamun Cheesecake", price: 210, description: "A desi twist on classic cheesecake.", veg: true },
      ] },
    ],
  },
  {
    name: "Cafe Mocha",
    description: "Speciality coffee, all-day breakfast and continental plates.",
    cuisines: ["Cafe", "Continental"],
    rating: 4.1, ratingCount: 610, deliveryTimeMin: 15, deliveryTimeMax: 25, priceForTwo: 350,
    offsetLat: 0.01, offsetLng: 0.03,
    categories: [
      { name: "Coffee", items: [
        { name: "Cappuccino", price: 140, description: "Double shot, velvety foam.", veg: true, popular: true, customizations: [{ name: "Milk", required: false, options: [{ name: "Whole milk", price: 0 }, { name: "Oat milk", price: 30 }] }] },
        { name: "Cold Brew", price: 170, description: "Slow-steeped 18 hours.", veg: true },
      ] },
      { name: "All Day Breakfast", items: [
        { name: "Avocado Toast", price: 260, description: "Sourdough, smashed avocado, chilli flakes.", veg: true },
        { name: "Club Sandwich", price: 240, description: "Triple-decker with fries.", veg: false, popular: true },
      ] },
    ],
  },
  {
    name: "Andhra Kitchen",
    description: "Authentic Andhra meals with fiery spice.",
    cuisines: ["South Indian", "Andhra"],
    rating: 4.3, ratingCount: 720, deliveryTimeMin: 30, deliveryTimeMax: 45, priceForTwo: 300,
    offsetLat: -0.028, offsetLng: 0.02,
    categories: [
      { name: "Meals", items: [
        { name: "Andhra Chicken Meal", price: 260, description: "Rice, curry, rasam, pickle and ghee.", veg: false, popular: true },
        { name: "Veg Thali", price: 210, description: "Assorted veg curries with rice and breads.", veg: true },
      ] },
      { name: "Tiffin", items: [
        { name: "Gongura Idli", price: 130, description: "Steamed idli with gongura chutney.", veg: true },
        { name: "Masala Dosa", price: 150, description: "Crisp dosa with potato masala.", veg: true, popular: true },
      ] },
    ],
  },
  {
    name: "Momo Junction",
    description: "Steamed, fried and tandoori momos with fiery chutneys.",
    cuisines: ["Chinese", "Tibetan"],
    rating: 4.5, ratingCount: 890, deliveryTimeMin: 25, deliveryTimeMax: 35, priceForTwo: 250,
    offsetLat: 0.018, offsetLng: -0.022,
    categories: [
      { name: "Momos", items: [
        { name: "Steamed Chicken Momos (8)", price: 160, description: "Juicy chicken dumplings.", veg: false, popular: true },
        { name: "Veg Cheese Momos (8)", price: 150, description: "Melted cheese and vegetables.", veg: true },
        { name: "Tandoori Momos (8)", price: 190, description: "Smoky char-grilled momos.", veg: false, popular: true },
      ] },
      { name: "Sides", items: [
        { name: "Chilli Potato", price: 140, description: "Crispy potatoes tossed in chilli sauce.", veg: true },
        { name: "Chicken Noodle Soup", price: 180, description: "Clear broth with noodles.", veg: false },
      ] },
    ],
  },
  {
    name: "Kebab Corner",
    description: "Tandoori kebabs and rolls, charcoal-fired.",
    cuisines: ["Kebab", "Mughlai"],
    rating: 4.8, ratingCount: 1100, deliveryTimeMin: 35, deliveryTimeMax: 50, priceForTwo: 600,
    offers: [{ title: "10% OFF up to ₹150", description: "On orders above ₹499" }],
    offsetLat: 0.04, offsetLng: 0.015, isOpen: true, isAcceptingOrders: false,
    categories: [
      { name: "Kebabs", items: [
        { name: "Seekh Kebab Roll", price: 220, description: "Mince kebab wrapped in roomali.", veg: false, popular: true },
        { name: "Tandoori Chicken (Half)", price: 340, description: "Charred, smoky and spiced.", veg: false, popular: true },
        { name: "Paneer Shashlik", price: 280, description: "Grilled paneer with peppers.", veg: true },
      ] },
      { name: "Mains", items: [
        { name: "Mutton Rogan Josh", price: 420, description: "Kashmiri-style lamb curry.", veg: false },
      ] },
    ],
  },
  {
    name: "Taco Tierra",
    description: "Street-style tacos, burritos and loaded nachos.",
    cuisines: ["Mexican", "Fast Food"],
    rating: 3.9, ratingCount: 330, deliveryTimeMin: 20, deliveryTimeMax: 30, priceForTwo: 280,
    offsetLat: -0.035, offsetLng: -0.01,
    categories: [
      { name: "Tacos", items: [
        { name: "Chicken Al Pastor Taco", price: 180, description: "Spit-roasted chicken, pineapple salsa.", veg: false, popular: true },
        { name: "Veggie Taco", price: 150, description: "Black beans, corn salsa, avocado.", veg: true },
      ] },
      { name: "Burritos", items: [
        { name: "Bean & Rice Burrito", price: 240, description: "Wrapped, grilled and hearty.", veg: true },
      ] },
    ],
  },
  {
    name: "Thai Orchid",
    description: "Fragrant Thai curries, noodles and street snacks.",
    cuisines: ["Thai", "Asian"],
    rating: 4.2, ratingCount: 470, deliveryTimeMin: 40, deliveryTimeMax: 55, priceForTwo: 550, isOpen: false,
    offsetLat: 0.045, offsetLng: -0.03,
    categories: [
      { name: "Curries", items: [
        { name: "Green Chicken Curry", price: 340, description: "Coconut, basil, bamboo shoots.", veg: false, popular: true },
        { name: "Veg Red Curry", price: 290, description: "Coconut and Thai eggplant.", veg: true },
      ] },
      { name: "Noodles", items: [
        { name: "Pad Thai", price: 310, description: "Rice noodles, tamarind, peanuts.", veg: false },
      ] },
    ],
  },
];

const CUISINE_CATEGORIES = [
  { name: "Biryani", slug: "biryani", emoji: "🍛" },
  { name: "Pizza", slug: "pizza", emoji: "🍕" },
  { name: "Burgers", slug: "burgers", emoji: "🍔" },
  { name: "North Indian", slug: "north-indian", emoji: "🍛" },
  { name: "Chinese", slug: "chinese", emoji: "🥡" },
  { name: "Healthy", slug: "healthy", emoji: "🥗" },
  { name: "Desserts", slug: "desserts", emoji: "🍰" },
  { name: "Cafe", slug: "cafe", emoji: "☕" },
  { name: "South Indian", slug: "south-indian", emoji: "🥞" },
  { name: "Mexican", slug: "mexican", emoji: "🌮" },
  { name: "Thai", slug: "thai", emoji: "🍜" },
];

export async function seedDatabase(mongoUri = process.env.MONGODB_URI ?? "mongodb://localhost:27017/ramnagar-eats") {
  await mongoose.connect(mongoUri);

  await Promise.all([
    User.deleteMany({}), Restaurant.deleteMany({}), MenuCategory.deleteMany({}), MenuItem.deleteMany({}),
    Category.deleteMany({}), Address.deleteMany({}), Coupon.deleteMany({}), Order.deleteMany({}), ServiceArea.deleteMany({}),
  ]);

  // V2: email-OTP / Google accounts — passwords are random and never used for login.
  const admin = await User.create({ name: "Platform Admin", phone: "+919876500002", email: "admin@ramnagareats.test", emailVerified: true, passwordHash: hashPassword("admin123"), role: "ADMIN" });
  const demoCustomer = await User.create({ name: "Demo Customer", phone: "+919876500000", email: "demo@ramnagareats.test", emailVerified: true, passwordHash: hashPassword("customer123"), role: "CUSTOMER" });
  const demoOwner = await User.create({ name: "Demo Restaurant Owner", phone: "+919876500001", email: "kitchen@ramnagareats.test", emailVerified: true, passwordHash: hashPassword("restaurant123"), role: "RESTAURANT" });

  // Admin-controlled delivery area (default 10 km, editable from the admin panel).
  await ServiceArea.create({
    key: "default",
    lat: CENTER.lat,
    lng: CENTER.lng,
    address: "Ramnagar Eats Hub, Mumbai",
    pincode: "400001",
    radiusKm: Number(process.env.SERVICE_RADIUS_KM ?? 10),
  });

  await Category.insertMany(CUISINE_CATEGORIES);

  const foodKeyword = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "food";
  const imageUrl = (keyword: string, width: number, height: number) => `https://loremflickr.com/${width}/${height}/${encodeURIComponent(foodKeyword(keyword))}`;

  const restaurants = [];
  for (const [index, seed] of RESTAURANTS.entries()) {
    const restaurant = await Restaurant.create({
      ownerId: index === 0 ? demoOwner.id : undefined,
      name: seed.name,
      description: seed.description,
      phone: `+9198765${String(10000 + index)}`,
      address: `${seed.name} Kitchen, Sector ${index + 1}, Ramnagar Eats Hub`,
      location: { type: "Point", coordinates: [CENTER.lng + seed.offsetLng, CENTER.lat + seed.offsetLat] },
      coverImage: imageUrl(seed.cuisines[0], 800, 450),
      cuisines: seed.cuisines,
      rating: seed.rating,
      ratingCount: seed.ratingCount,
      deliveryTimeMin: seed.deliveryTimeMin,
      deliveryTimeMax: seed.deliveryTimeMax,
      priceForTwo: seed.priceForTwo,
      isPureVeg: seed.isPureVeg ?? false,
      isOpen: seed.isOpen ?? true,
      isAcceptingOrders: seed.isAcceptingOrders ?? true,
      openingTime: seed.openingTime ?? "",
      closingTime: seed.closingTime ?? "",
      offers: seed.offers ?? [],
    });
    restaurants.push(restaurant);

    for (const [categoryIndex, category] of seed.categories.entries()) {
      const menuCategory = await MenuCategory.create({ restaurantId: restaurant.id, name: category.name, sortOrder: categoryIndex });
      await MenuItem.insertMany(
        category.items.map((item) => ({
          restaurantId: restaurant.id,
          categoryId: menuCategory.id,
          name: item.name,
          description: item.description ?? "",
          price: item.price,
          image: item.image ?? imageUrl(item.name, 400, 300),
          isVeg: item.veg ?? false,
          isAvailable: !item.unavailable,
          isPopular: item.popular ?? false,
          isRecommended: item.recommended ?? false,
          prepTime: item.prepTime ?? 15,
          customizations: item.customizations ?? [],
        })),
      );
    }
  }

  await Coupon.insertMany([
    { code: "WELCOME20", description: "20% off up to ₹100 on orders above ₹249", discountType: "PERCENT", discountValue: 20, maxDiscount: 100, minOrderValue: 249 },
    { code: "FLAT50", description: "Flat ₹50 off on orders above ₹399", discountType: "FLAT", discountValue: 50, minOrderValue: 399 },
    { code: "SAVE50", description: "Flat ₹50 off on orders above ₹299", discountType: "FLAT", discountValue: 50, minOrderValue: 299 },
    { code: "PIZZA10", description: "10% off at Pizza Roma", discountType: "PERCENT", discountValue: 10, maxDiscount: 60, minOrderValue: 200 },
  ]);

  const pizzaRoma = restaurants.find((restaurant) => restaurant.name === "Pizza Roma");
  if (pizzaRoma) await Coupon.updateOne({ code: "PIZZA10" }, { $set: { restaurantIds: [pizzaRoma.id] } });

  await Address.create({
    userId: demoCustomer.id,
    label: "Home",
    formattedAddress: "12 Palm Grove, Bandra West, Mumbai",
    pincode: "400050",
    city: "Mumbai",
    state: "Maharashtra",
    locality: "Bandra West",
    latitude: CENTER.lat,
    longitude: CENTER.lng,
    isDefault: true,
  });

  console.info(
    `Seeded: admin (admin@ramnagareats.test), demo customer (demo@ramnagareats.test), demo owner (kitchen@ramnagareats.test), ` +
      `${CUISINE_CATEGORIES.length} categories, ${restaurants.length} restaurants, delivery area ${Number(process.env.SERVICE_RADIUS_KM ?? 10)} km. ` +
      `Log in with email + OTP (dev codes appear in the API log or via /auth/dev-otp?email=...).`,
  );
  return { admin, demoCustomer, demoOwner, restaurants };
}

// Run directly: npm run seed
if (process.argv[1]?.endsWith("seed.ts") || process.argv[1]?.endsWith("seed.js")) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Seed failed:", error);
      process.exit(1);
    });
}
