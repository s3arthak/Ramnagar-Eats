/**
 * One-shot: bring the home-feed content in line with the code defaults —
 * fill in missing Category images, insert any missing default banner, and repair
 * banners still showing a photo that a category tile already uses.
 * Safe to run on production — only fills and repairs, never deletes.
 *
 * Run: cd backend && npx tsx scripts/enrich-categories.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import { Banner } from "../src/models/Banner.js";
import { Category } from "../src/models/Category.js";

const U = (id: string) => `https://images.unsplash.com/photo-${id}?w=400&q=70&auto=format&fit=crop`;

const IMAGES: Record<string, string> = {
  biryani: U("1589302168068-964664d93dc0"),
  pizza: U("1565299624946-b28f40a0ae38"),
  kashmiri: U("1631452180519-c014fe946bc7"),
  "north-indian": U("1585937421612-70a008356fbe"),
  "north indian": U("1585937421612-70a008356fbe"),
  punjabi: U("1565557623262-b51c2513a641"),
  dhaba: U("1596797038530-2c107229654b"),
  healthy: U("1512621776951-a57141f2eefd"),
  desserts: U("1488477181946-6428a0291777"),
  cafe: U("1495474472287-4d71bcdd2085"),
  chinese: U("1563379091339-03b21ab4a4f8"),
  tibetan: U("1569718212165-3a8278d5f624"),
  dogri: U("1517244683847-7456b63c5969"),
  "fast-food": U("1568901346375-23c9450c58cd"),
  "fast food": U("1568901346375-23c9450c58cd"),
};

/**
 * Photos the first banner defaults shared with category tiles (Biryani, Pizza,
 * Fast Food, Chinese) — a repaired banner must never point at one again.
 */
const LEGACY_CATEGORY_IMAGE_IDS = [
  "1589302168068-964664d93dc0",
  "1565299624946-b28f40a0ae38",
  "1568901346375-23c9450c58cd",
  "1563379091339-03b21ab4a4f8",
];

/**
 * Default home-page promo banners (admin-editable from the restaurant panel).
 *
 * Banner art is deliberately kept out of the category images: reusing a category
 * photo made the promo carousel repeat the exact images in the
 * "What's on your mind?" tiles right underneath it.
 */
const DEFAULT_BANNERS = [
  {
    title: "Iconic Weekend Deals!",
    subtitle: "It's time for yummy food & amazing savings.",
    ctaLabel: "ORDER NOW",
    ctaLink: "/restaurants",
    image: U("1540189549336-e6e99c3679fe"),
    theme: "purple",
    sortOrder: 0,
    isActive: true,
  },
  {
    title: "₹100 OFF above ₹499",
    subtitle: "Use code WELCOME100 on your first order today.",
    ctaLabel: "GRAB DEAL",
    ctaLink: "/restaurants?sort=rating",
    image: U("1555939594-58d7cb561ad1"),
    theme: "orange",
    sortOrder: 1,
    isActive: true,
  },
  {
    title: "Free delivery all week",
    subtitle: "On orders above ₹499 from every kitchen near you.",
    ctaLabel: "ORDER NOW",
    ctaLink: "/restaurants",
    image: U("1546069901-ba9599a7e63c"),
    theme: "green",
    sortOrder: 2,
    isActive: true,
  },
  {
    title: "Best sellers under ₹199",
    subtitle: "Biryani, burgers, momos & more — pocket friendly.",
    ctaLabel: "EXPLORE",
    ctaLink: "/restaurants?price=250",
    image: U("1585032226651-759b368d7246"),
    theme: "dark",
    sortOrder: 3,
    isActive: true,
  },
];

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required");
  await mongoose.connect(uri);

  const categories = await Category.find();
  let updated = 0;
  for (const category of categories) {
    if (category.image) continue;
    const image = IMAGES[category.slug] ?? IMAGES[category.name.toLowerCase()] ?? U("1504674900247-0877df9cc836");
    await Category.updateOne({ _id: category._id }, { $set: { image } });
    updated += 1;
  }
  console.log(`Categories enriched: ${updated}/${categories.length}`);

  // Banners: insert any default that is missing, and repair the ones still
  // showing a photo a category tile uses. A banner an admin has renamed, or
  // given its own photo, is never touched.
  let bannersInserted = 0;
  let bannersRepaired = 0;
  for (const banner of DEFAULT_BANNERS) {
    const existing = await Banner.findOne({ title: banner.title });
    if (!existing) {
      await Banner.create(banner);
      bannersInserted += 1;
      continue;
    }
    if (LEGACY_CATEGORY_IMAGE_IDS.some((id) => (existing.image ?? "").includes(id))) {
      existing.image = banner.image;
      await existing.save();
      bannersRepaired += 1;
    }
  }
  const bannerTotal = await Banner.countDocuments();
  console.log(`Banners: ${bannersInserted} inserted, ${bannersRepaired} images repaired (${bannerTotal} total)`);

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
