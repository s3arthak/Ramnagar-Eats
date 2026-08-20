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

// Ramnagar, Jammu — the platform's real delivery area (matches the production
// Atlas service area). Overridable via SERVICE_CENTER_LAT/LNG env vars.
const CENTER = {
  lat: Number(process.env.SERVICE_CENTER_LAT ?? 32.80674),
  lng: Number(process.env.SERVICE_CENTER_LNG ?? 75.314854),
};
const RADIUS_KM = Number(process.env.SERVICE_RADIUS_KM ?? 15);

// Verified real food photos (Unsplash CDN, all returning 200). Keyword-matched
// by dish so every restaurant cover and menu item shows a genuine food photo
// instead of a random placeholder.
const U = (id: string) => `https://images.unsplash.com/photo-${id}?w=800&q=70&auto=format&fit=crop`;
const FOOD_IMAGES: Record<string, string> = {
  biryani: U("1589302168068-964664d93dc0"),
  pizza: U("1565299624946-b28f40a0ae38"),
  burger: U("1568901346375-23c9450c58cd"),
  sandwich: U("1528735602780-2552fd46c7af"),
  coffee: U("1495474472287-4d71bcdd2085"),
  chai: U("1571934811356-5cc061b6821f"),
  salad: U("1512621776951-a57141f2eefd"),
  bowl: U("1546069901-ba9599a7e63c"),
  indian: U("1517244683847-7456b63c5969"),
  noodles: U("1563379091339-03b21ab4a4f8"),
  dessert: U("1565958011703-44f9829ba187"),
  sweet: U("1551024506-0bccd828d307"),
  breakfast: U("1567620905732-2d1ec7ab7445"),
  meal: U("1540189549336-e6e99c3679fe"),
  curry: U("1601050690597-df0568f70950"),
  roganjosh: U("1631452180519-c014fe946bc7"),
  grill: U("1555939594-58d7cb561ad1"),
  momo: U("1569718212165-3a8278d5f624"),
  dumpling: U("1585032226651-759b368d7246"),
  spread: U("1504674900247-0877df9cc836"),
  rice: U("1512058564366-18510be2db19"),
  juice: U("1613478223719-2ab802602423"),
  cake: U("1578985545662-b28f40a0ae38"),
  kulcha: U("1565557623262-b51c2513a641"),
  roll: U("1552374196-1ab2a1c593e8"),
  tandoori: U("1599487488170-d11ec9c172f0"),
  snack: U("1601050690597-df0568f70950"),
};

const foodKeyword = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** Real food photo for a dish name: longest matching keyword wins, sensible fallback otherwise. */
function imageFor(value: string): string {
  const words = foodKeyword(value);
  const matches = Object.entries(FOOD_IMAGES)
    .filter(([keyword]) => words.includes(keyword))
    .sort((a, b) => b[0].length - a[0].length);
  if (matches.length) return matches[0][1];
  if (words.includes("chicken") || words.includes("mutton") || words.includes("paneer")) return FOOD_IMAGES.curry;
  if (words.includes("veg") || words.includes("salad")) return FOOD_IMAGES.salad;
  return FOOD_IMAGES.indian;
}

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
  street: string;
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

// 12 restaurants around the Ramnagar service area (real Jammu names, Indian
// dishes). Ten sit inside a 5 km radius (API-test invariant), two further out
// (8–13 km) so the 15 km production area feels real.
const RESTAURANTS: SeedRestaurant[] = [
  {
    name: "Royal Biryani House",
    description: "Slow-cooked dum biryanis and Mughlai classics, straight from the handi.",
    street: "Gol Market, Ramnagar",
    cuisines: ["Biryani", "Mughlai"],
    rating: 4.5, ratingCount: 1200, deliveryTimeMin: 25, deliveryTimeMax: 35, priceForTwo: 350,
    offers: [{ title: "20% OFF up to ₹100", description: "On orders above ₹249" }],
    offsetLat: 0.012, offsetLng: -0.008,
    categories: [
      { name: "Biryani", items: [
        { name: "Chicken Dum Biryani", price: 240, description: "Fragrant basmati layered with spiced chicken, sealed and slow-cooked.", veg: false, popular: true, recommended: true, prepTime: 20, customizations: [{ name: "Spice level", required: true, options: [{ name: "Mild", price: 0 }, { name: "Medium", price: 0 }, { name: "Extra spicy", price: 0 }] }, { name: "Add-ons", options: [{ name: "Extra chicken", price: 90 }, { name: "Extra raita", price: 30 }] }] },
        { name: "Mutton Dum Biryani", price: 320, description: "Tender mutton pieces, saffron rice and fried onions.", veg: false, popular: true, prepTime: 25 },
        { name: "Hyderabadi Chicken Biryani", price: 260, description: "Tangy, spicy and packed with fresh mint.", veg: false, recommended: true, prepTime: 22 },
        { name: "Veg Dum Biryani", price: 190, description: "Garden vegetables and aromatic spices in dum style.", veg: true, prepTime: 18 },
      ] },
      { name: "Starters", items: [
        { name: "Chicken 65", price: 190, description: "Fiery fried chicken tossed with curry leaves.", veg: false, popular: true, prepTime: 12 },
        { name: "Paneer Tikka", price: 200, description: "Char-grilled cottage cheese, peppers and onions.", veg: true, recommended: true, prepTime: 12 },
        { name: "Tandoori Chicken (Half)", price: 300, description: "Charred in the clay oven, smoky and juicy.", veg: false, prepTime: 18 },
      ] },
      { name: "Breads & Sides", items: [
        { name: "Butter Naan", price: 40, description: "Soft tandoor bread brushed with butter.", veg: true },
        { name: "Garlic Naan", price: 60, description: "Tandoor bread with garlic butter.", veg: true },
        { name: "Burani Raita", price: 50, description: "Cooled yogurt with roasted cumin.", veg: true },
      ] },
    ],
  },
  {
    name: "Pizza Roma",
    description: "Wood-fired pizzas and Italian classics, right here in Jammu.",
    street: "Residency Road, Gandhi Nagar",
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
    name: "Kashmir Rasoi",
    description: "Authentic Wazwan — Rogan Josh, Gushtaba and Kashmiri Dum Aloo.",
    street: "Trikuta Nagar, Canal Road",
    cuisines: ["Kashmiri", "North Indian"],
    rating: 4.7, ratingCount: 950, deliveryTimeMin: 30, deliveryTimeMax: 45, priceForTwo: 450,
    offsetLat: -0.02, offsetLng: -0.015,
    categories: [
      { name: "Wazwan", items: [
        { name: "Rogan Josh", price: 380, description: "Kashmiri lamb curry with a deep red gravy of Kashmiri chillies.", veg: false, popular: true, recommended: true, prepTime: 25 },
        { name: "Gushtaba", price: 420, description: "Hand-pounded mutton meatballs in yogurt gravy.", veg: false, prepTime: 30 },
        { name: "Yakhni", price: 340, description: "Delicate fennel-flavoured mutton curry.", veg: false, recommended: true, prepTime: 25 },
        { name: "Kashmiri Dum Aloo", price: 240, description: "Baby potatoes in a rich, spiced gravy.", veg: true, popular: true, prepTime: 20 },
      ] },
      { name: "Rice & Bread", items: [
        { name: "Kashmiri Naan", price: 60, description: "Stuffed, soft tandoor bread.", veg: true },
        { name: "Saffron Rice", price: 140, description: "Fragrant basmati with saffron and nuts.", veg: true },
      ] },
    ],
  },
  {
    name: "Sharma Ji Dhaba",
    description: "Highway-style dhaba — rajma, chole, tandoori and fresh rotis.",
    street: "Jammu Bazaar, Shastri Nagar",
    cuisines: ["North Indian", "Dhaba"],
    rating: 4.4, ratingCount: 2100, deliveryTimeMin: 20, deliveryTimeMax: 25, priceForTwo: 200,
    offsetLat: 0.005, offsetLng: 0.02,
    categories: [
      { name: "Main Course", items: [
        { name: "Rajma Chawal", price: 120, description: "Creamy kidney beans, ghee-tossed rice.", veg: true, popular: true, recommended: true, prepTime: 10 },
        { name: "Chole Bhature", price: 110, description: "Spicy chickpeas with fluffy bhature.", veg: true, popular: true, prepTime: 10 },
        { name: "Dal Makhani", price: 160, description: "Slow-simmered black lentils with butter.", veg: true, prepTime: 15 },
        { name: "Kadhi Chawal", price: 130, description: "Tangy yogurt curry with pakoras.", veg: true, prepTime: 12 },
      ] },
      { name: "Tandoor", items: [
        { name: "Tandoori Chicken (Half)", price: 280, description: "Smoky, charred and spiced.", veg: false, prepTime: 18 },
        { name: "Amritsari Fish", price: 320, description: "Crisp battered fish with ajwain.", veg: false, recommended: true, prepTime: 20 },
        { name: "Paneer Tikka", price: 200, description: "Grilled cottage cheese and peppers.", veg: true, prepTime: 15 },
        { name: "Tandoori Roti", price: 20, description: "Whole-wheat bread from the clay oven.", veg: true },
      ] },
    ],
  },
  {
    name: "Amritsari Kulcha Junction",
    description: "Stuffed kulchas, bhature and tall glasses of lassi.",
    street: "Channi Himmat, Rohtak Chowk",
    cuisines: ["Punjabi", "North Indian"],
    rating: 4.3, ratingCount: 1100, deliveryTimeMin: 15, deliveryTimeMax: 25, priceForTwo: 220,
    offsetLat: 0.025, offsetLng: 0.005,
    categories: [
      { name: "Kulchas", items: [
        { name: "Amritsari Paneer Kulcha", price: 140, description: "Paneer-stuffed kulcha with chole and pickle.", veg: true, popular: true, prepTime: 12 },
        { name: "Aloo Kulcha", price: 110, description: "Spiced potato-stuffed kulcha.", veg: true, prepTime: 10 },
        { name: "Chole Kulcha", price: 150, description: "Kulcha served with Amritsari chole.", veg: true, recommended: true, prepTime: 10 },
        { name: "Bhatura Chole", price: 120, description: "Deep-fried bhatura with chole.", veg: true, prepTime: 10 },
      ] },
      { name: "Lassi", items: [
        { name: "Sweet Lassi", price: 80, description: "Thick, creamy and chilled.", veg: true },
        { name: "Mango Lassi", price: 100, description: "Seasonal mango blended with curd.", veg: true, popular: true },
      ] },
    ],
  },
  {
    name: "Green Leaf Bowl",
    description: "Fresh salads, grain bowls and cold-pressed juices.",
    street: "Bahu Plaza, Satwari",
    cuisines: ["Healthy", "Salads"],
    rating: 4.4, ratingCount: 620, deliveryTimeMin: 15, deliveryTimeMax: 25, priceForTwo: 250, isPureVeg: true,
    offsetLat: 0.01, offsetLng: 0.03,
    categories: [
      { name: "Bowls", items: [
        { name: "Quinoa Power Bowl", price: 260, description: "Quinoa, chickpeas, avocado, tahini.", veg: true, popular: true, prepTime: 12 },
        { name: "Greek Salad Bowl", price: 230, description: "Feta, olives, cucumber, cherry tomatoes.", veg: true, prepTime: 8 },
        { name: "Paneer Teriyaki Bowl", price: 280, description: "Grilled paneer over rice and greens.", veg: true, prepTime: 15 },
      ] },
      { name: "Juices", items: [
        { name: "Green Detox", price: 140, description: "Spinach, apple, cucumber, ginger.", veg: true, prepTime: 5 },
        { name: "Beetroot Boost", price: 150, description: "Beetroot, carrot, orange.", veg: true, prepTime: 5 },
        { name: "Watermelon Cooler", price: 120, description: "Fresh watermelon and mint.", veg: true, prepTime: 5 },
      ] },
    ],
  },
  {
    name: "Krishna Sweets & Bakers",
    description: "Fresh mithai, cakes and pastries made every morning.",
    street: "Gol Market, Ramnagar",
    cuisines: ["Desserts", "Bakery"],
    rating: 4.6, ratingCount: 1400, deliveryTimeMin: 20, deliveryTimeMax: 30, priceForTwo: 200, isPureVeg: true,
    offsetLat: -0.005, offsetLng: -0.025,
    categories: [
      { name: "Mithai", items: [
        { name: "Kaju Katli (500 g)", price: 240, description: "Diamond-cut cashew fudge.", veg: true, popular: true },
        { name: "Motichoor Ladoo (500 g)", price: 180, description: "Bite-sized gram-flour ladoos.", veg: true },
        { name: "Gulab Jamun (6 pc)", price: 120, description: "Warm, syrup-soaked dumplings.", veg: true, popular: true },
        { name: "Jalebi (250 g)", price: 100, description: "Crisp, saffron syrup spirals.", veg: true },
      ] },
      { name: "Cakes", items: [
        { name: "Belgian Chocolate Truffle", price: 320, description: "Rich dark chocolate layers.", veg: true, popular: true },
        { name: "Red Velvet Slice", price: 180, description: "Cream cheese frosting.", veg: true },
        { name: "Pineapple Pastry", price: 90, description: "Classic cream-filled pastry.", veg: true },
      ] },
    ],
  },
  {
    name: "Tandoori Grill House",
    description: "Charcoal-fired kebabs, rolls and Mughlai mains.",
    street: "Residency Road, Gandhi Nagar",
    cuisines: ["Kebab", "Mughlai"],
    rating: 4.8, ratingCount: 1700, deliveryTimeMin: 35, deliveryTimeMax: 50, priceForTwo: 600,
    offers: [{ title: "10% OFF up to ₹150", description: "On orders above ₹499" }],
    offsetLat: 0.035, offsetLng: 0.01, isAcceptingOrders: false,
    categories: [
      { name: "Kebabs", items: [
        { name: "Seekh Kebab Roll", price: 220, description: "Mince kebab wrapped in roomali.", veg: false, popular: true, prepTime: 15 },
        { name: "Malai Chicken Tikka", price: 290, description: "Creamy, mildly spiced tikka.", veg: false, recommended: true, prepTime: 18 },
        { name: "Tandoori Chicken (Full)", price: 420, description: "Whole bird, charred and smoky.", veg: false, prepTime: 25 },
        { name: "Fish Tikka", price: 340, description: "Spiced fish from the tandoor.", veg: false, prepTime: 20 },
      ] },
      { name: "Mains", items: [
        { name: "Mutton Rogan Josh", price: 420, description: "Kashmiri-style lamb curry.", veg: false },
        { name: "Butter Chicken", price: 320, description: "Tandoori chicken in makhani gravy.", veg: false, popular: true },
      ] },
    ],
  },
  {
    name: "Chai Point",
    description: "Cutting chai, filter coffee and quick snacks all day.",
    street: "Trikuta Nagar, Canal Road",
    cuisines: ["Cafe", "Snacks"],
    rating: 4.1, ratingCount: 800, deliveryTimeMin: 15, deliveryTimeMax: 25, priceForTwo: 150, isPureVeg: true,
    offsetLat: 0.018, offsetLng: -0.022,
    categories: [
      { name: "Chai & Coffee", items: [
        { name: "Cutting Chai", price: 20, description: "Half-glass, full strength.", veg: true, popular: true, prepTime: 5 },
        { name: "Masala Chai", price: 30, description: "Ginger and cardamom spiced.", veg: true, prepTime: 5 },
        { name: "Filter Coffee", price: 60, description: "South Indian style, frothy.", veg: true, prepTime: 6 },
        { name: "Cappuccino", price: 120, description: "Double shot, velvety foam.", veg: true, prepTime: 6 },
      ] },
      { name: "Snacks", items: [
        { name: "Veg Maggi", price: 70, description: "Masala noodles, desi style.", veg: true, popular: true, prepTime: 8 },
        { name: "Cheese Toast", price: 90, description: "Grilled, golden and gooey.", veg: true, prepTime: 8 },
        { name: "Samosa (2 pc)", price: 40, description: "Crisp, potato-stuffed.", veg: true, prepTime: 5 },
        { name: "Bun Maska", price: 50, description: "Buttered bun with chai.", veg: true, prepTime: 5 },
      ] },
    ],
  },
  {
    name: "Momos & More",
    description: "Steamed, fried and tandoori momos with fiery chutneys.",
    street: "Shastri Nagar, Jammu Bazaar",
    cuisines: ["Chinese", "Tibetan"],
    rating: 4.5, ratingCount: 1300, deliveryTimeMin: 25, deliveryTimeMax: 35, priceForTwo: 250,
    offsetLat: -0.028, offsetLng: 0.02,
    categories: [
      { name: "Momos", items: [
        { name: "Steamed Chicken Momos (8)", price: 160, description: "Juicy chicken dumplings.", veg: false, popular: true, prepTime: 12 },
        { name: "Veg Cheese Momos (8)", price: 150, description: "Melted cheese and vegetables.", veg: true, prepTime: 12 },
        { name: "Tandoori Momos (8)", price: 190, description: "Smoky char-grilled momos.", veg: false, popular: true, prepTime: 15 },
        { name: "Fried Momos (8)", price: 170, description: "Golden, crisp and crunchy.", veg: false, prepTime: 12 },
      ] },
      { name: "Soups & Sides", items: [
        { name: "Chicken Noodle Soup", price: 180, description: "Clear broth with noodles.", veg: false, prepTime: 10 },
        { name: "Veg Manchurian", price: 160, description: "Crisp veg balls in garlic sauce.", veg: true, prepTime: 12 },
        { name: "Hakka Noodles", price: 170, description: "Wok-tossed with vegetables.", veg: true, prepTime: 10 },
      ] },
    ],
  },
  {
    name: "Dogri Dham",
    description: "Home-style Dogra thalis — maa ki dal, khadi and local favourites.",
    street: "Bahu Plaza, Satwari",
    cuisines: ["Dogri", "North Indian"],
    rating: 4.9, ratingCount: 650, deliveryTimeMin: 30, deliveryTimeMax: 40, priceForTwo: 300,
    offsetLat: 0.09, offsetLng: 0.05,
    categories: [
      { name: "Dogra Thalis", items: [
        { name: "Maa ki Dal Thali", price: 220, description: "Urad dal, rice, salad and pickle.", veg: true, popular: true, recommended: true, prepTime: 20 },
        { name: "Dham Special Thali", price: 320, description: "Festive spread — dal, khadi, rice, rajma and sweet.", veg: true, prepTime: 25 },
        { name: "Khadi Chawal", price: 140, description: "Tangy gram-flour curry with rice.", veg: true, prepTime: 12 },
      ] },
      { name: "Local Specials", items: [
        { name: "Dogri Rajma", price: 160, description: "Kidney beans cooked with local spices.", veg: true, prepTime: 15 },
        { name: "Gheewar", price: 180, description: "Traditional Dogra sweet, saffron and ghee.", veg: true, prepTime: 10 },
      ] },
    ],
  },
  {
    name: "The Sandwich Co",
    description: "Grilled sandwiches, loaded fries and cold coffees.",
    street: "Channi Himmat, Rohtak Chowk",
    cuisines: ["Continental", "Fast Food"],
    rating: 3.9, ratingCount: 420, deliveryTimeMin: 20, deliveryTimeMax: 30, priceForTwo: 250, isOpen: false,
    offsetLat: -0.1, offsetLng: 0.08,
    categories: [
      { name: "Sandwiches", items: [
        { name: "Grilled Veg Sandwich", price: 120, description: "Layered veg, mint chutney, grilled.", veg: true, popular: true, prepTime: 8 },
        { name: "Chicken Tikka Sandwich", price: 180, description: "Smoky tikka with mayo and lettuce.", veg: false, prepTime: 10 },
        { name: "Club Sandwich", price: 220, description: "Triple-decker with fries.", veg: false, recommended: true, prepTime: 10 },
      ] },
      { name: "Beverages", items: [
        { name: "Cold Coffee", price: 130, description: "Frothy and chilled.", veg: true, prepTime: 5 },
        { name: "Oreo Shake", price: 150, description: "Thick shake loaded with Oreo.", veg: true, popular: true, prepTime: 6 },
        { name: "Fresh Lime Soda", price: 90, description: "Sweet, salty or mixed.", veg: true, prepTime: 4 },
      ] },
    ],
  },
];

const CUISINE_CATEGORIES = [
  { name: "Biryani", slug: "biryani", emoji: "🍛" },
  { name: "Pizza", slug: "pizza", emoji: "🍕" },
  { name: "Kashmiri", slug: "kashmiri", emoji: "🍲" },
  { name: "North Indian", slug: "north-indian", emoji: "🍛" },
  { name: "Punjabi", slug: "punjabi", emoji: "🫓" },
  { name: "Dhaba", slug: "dhaba", emoji: "🍲" },
  { name: "Healthy", slug: "healthy", emoji: "🥗" },
  { name: "Desserts", slug: "desserts", emoji: "🍰" },
  { name: "Cafe", slug: "cafe", emoji: "☕" },
  { name: "Chinese", slug: "chinese", emoji: "🥡" },
  { name: "Tibetan", slug: "tibetan", emoji: "🥟" },
  { name: "Dogri", slug: "dogri", emoji: "🍛" },
  { name: "Fast Food", slug: "fast-food", emoji: "🍔" },
];

const STREET_POOL = [
  "Gol Market, Ramnagar", "Residency Road, Gandhi Nagar", "Trikuta Nagar, Canal Road",
  "Jammu Bazaar, Shastri Nagar", "Channi Himmat, Rohtak Chowk", "Bahu Plaza, Satwari",
];

/** Create the restaurant catalog (restaurants + menu + coupons + categories). Shared by full seed and --restaurants-only. */
async function seedCatalog(demoOwnerId?: mongoose.Types.ObjectId) {
  await Promise.all([
    Restaurant.deleteMany({}), MenuCategory.deleteMany({}), MenuItem.deleteMany({}),
    Category.deleteMany({}), Coupon.deleteMany({}),
  ]);

  await Category.insertMany(CUISINE_CATEGORIES);

  const restaurants = [];
  for (const [index, seed] of RESTAURANTS.entries()) {
    const restaurant = await Restaurant.create({
      ownerId: index === 0 ? demoOwnerId : undefined,
      name: seed.name,
      description: seed.description,
      phone: `+9198765${String(10000 + index)}`,
      address: `${seed.street || STREET_POOL[index % STREET_POOL.length]}, Jammu`,
      location: { type: "Point", coordinates: [CENTER.lng + seed.offsetLng, CENTER.lat + seed.offsetLat] },
      coverImage: imageFor(seed.cuisines[0]),
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
          image: item.image ?? imageFor(item.name),
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

  return restaurants;
}

export async function seedDatabase(mongoUri = process.env.MONGODB_URI ?? "mongodb://localhost:27017/ramnagar-eats") {
  await mongoose.connect(mongoUri);
  const restaurantsOnly = process.argv.includes("--restaurants-only");

  if (!restaurantsOnly) {
    await Promise.all([User.deleteMany({}), Address.deleteMany({}), Order.deleteMany({}), ServiceArea.deleteMany({})]);
  }

  let admin!: mongoose.HydratedDocument<any>;
  let demoCustomer!: mongoose.HydratedDocument<any>;
  let demoOwner!: mongoose.HydratedDocument<any>;
  if (restaurantsOnly) {
    // Production reseed: never touch users. Resolve (or create) the demo owner so
    // the first restaurant keeps its owner link, and skip admin/demo customer.
    demoOwner = (await User.findOneAndUpdate(
      { email: "kitchen@ramnagareats.test" },
      { $setOnInsert: { name: "Demo Restaurant Owner", phone: "+919876500001", emailVerified: true, passwordHash: hashPassword("restaurant123"), role: "RESTAURANT" } },
      { upsert: true, returnDocument: "after" },
    )) as any;
    // Place restaurants around the *existing* live service area, whatever it is.
    const area = await ServiceArea.findOne({ key: "default" }).lean();
    if (area) {
      CENTER.lat = area.lat;
      CENTER.lng = area.lng;
    }
  } else {
    // V2: email-OTP / Google accounts — passwords are random and never used for login.
    admin = await User.create({ name: "Platform Admin", phone: "+919876500002", email: "admin@ramnagareats.test", emailVerified: true, passwordHash: hashPassword("admin123"), role: "ADMIN" });
    demoCustomer = await User.create({ name: "Demo Customer", phone: "+919876500000", email: "demo@ramnagareats.test", emailVerified: true, passwordHash: hashPassword("customer123"), role: "CUSTOMER" });
    demoOwner = await User.create({ name: "Demo Restaurant Owner", phone: "+919876500001", email: "kitchen@ramnagareats.test", emailVerified: true, passwordHash: hashPassword("restaurant123"), role: "RESTAURANT" });
    // Additional restaurant owner: Sarthak Kharka — Royal Biryani House
    await User.findOneAndUpdate(
      { email: "kharkasarthak@gmail.com", role: "RESTAURANT" },
      { $setOnInsert: { name: "Sarthak Kharka", phone: "+919876500003", emailVerified: true, passwordHash: hashPassword("restaurant123"), role: "RESTAURANT" } },
      { upsert: true, new: true },
    );
  }

  if (!restaurantsOnly) {
    // Admin-controlled delivery area — Ramnagar, Jammu (editable from the admin panel).
    await ServiceArea.create({
      key: "default",
      lat: CENTER.lat,
      lng: CENTER.lng,
      address: "Ramnagar Eats Central Hub, Ramnagar, Jammu",
      pincode: "182122",
      radiusKm: RADIUS_KM,
    });

    await Address.create({
      userId: demoCustomer.id,
      label: "Home",
      formattedAddress: "1 Canal Road, Ramnagar, Jammu",
      pincode: "182122",
      city: "Jammu",
      state: "Jammu & Kashmir",
      locality: "Ramnagar",
      latitude: CENTER.lat,
      longitude: CENTER.lng,
      isDefault: true,
    });
  }

  const restaurants = await seedCatalog(demoOwner.id);

  // Give Sarthak Kharka (kharkasarthak@gmail.com) their own restaurant
  // so the demo owner's Royal Biryani House is untouched.
  const kharkaOwner = await User.findOne({ email: "kharkasarthak@gmail.com", role: "RESTAURANT" });
  if (kharkaOwner && !await Restaurant.findOne({ ownerId: kharkaOwner.id })) {
    const kharkaRestaurant = await Restaurant.create({
      ownerId: kharkaOwner.id,
      name: "Sarthak's Kitchen",
      description: "Authentic Indian cuisine from Sarthak's kitchen.",
      phone: "+919876510099",
      address: "Gol Market, Ramnagar, Jammu",
      location: { type: "Point", coordinates: [CENTER.lng + 0.002, CENTER.lat + 0.001] },
      coverImage: imageFor("Indian"),
      cuisines: ["North Indian", "Indian"],
      rating: 4.5, ratingCount: 50,
      deliveryTimeMin: 25, deliveryTimeMax: 35, priceForTwo: 350,
      isOpen: true, isAcceptingOrders: true,
    });
    const cat = await MenuCategory.create({ restaurantId: kharkaRestaurant.id, name: "Mains", sortOrder: 0 });
    await MenuItem.insertMany([
      { restaurantId: kharkaRestaurant.id, categoryId: cat.id, name: "Butter Chicken", description: "Classic tandoori chicken in creamy makhani gravy.", price: 320, image: imageFor("curry"), isVeg: false, isAvailable: true, isPopular: true, prepTime: 18, customizations: [] },
      { restaurantId: kharkaRestaurant.id, categoryId: cat.id, name: "Paneer Tikka", description: "Grilled cottage cheese with peppers.", price: 260, image: imageFor("tandoori"), isVeg: true, isAvailable: true, isPopular: true, prepTime: 15, customizations: [] },
      { restaurantId: kharkaRestaurant.id, categoryId: cat.id, name: "Chicken Biryani", description: "Fragrant basmati with spiced chicken.", price: 280, image: imageFor("biryani"), isVeg: false, isAvailable: true, recommended: true, prepTime: 22, customizations: [{ name: "Spice level", required: true, options: [{ name: "Mild", price: 0 }, { name: "Medium", price: 0 }, { name: "Extra spicy", price: 0 }] }] },
      { restaurantId: kharkaRestaurant.id, categoryId: cat.id, name: "Dal Makhani", description: "Slow-simmered black lentils with butter.", price: 200, image: imageFor("curry"), isVeg: true, isAvailable: true, prepTime: 15, customizations: [] },
    ]);
  }

  console.info(
    `Seeded: ${restaurantsOnly ? "restaurant catalog only (users/orders/service-area untouched)" : `admin (admin@ramnagareats.test), demo customer (demo@ramnagareats.test), demo owner (kitchen@ramnagareats.test)`}, ` +
      `${CUISINE_CATEGORIES.length} categories, ${restaurants.length} restaurants around ${CENTER.lat.toFixed(4)}, ${CENTER.lng.toFixed(4)} (${restaurantsOnly ? "existing service area" : `${RADIUS_KM} km radius`}).`,
  );
  return { admin, demoCustomer, demoOwner, restaurants };
}

// Run directly: npm run seed   (add -- --restaurants-only to reseed just the catalog)
if (process.argv[1]?.endsWith("seed.ts") || process.argv[1]?.endsWith("seed.js")) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Seed failed:", error);
      process.exit(1);
    });
}
