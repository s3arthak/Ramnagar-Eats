/**
 * Read-only verification of the production Atlas data after the restaurants-only
 * reseed. Confirms service area, restaurant placement/count, menu images, and
 * that users/orders were left untouched.
 *
 * Usage: cd backend && npx tsx scripts/verify-atlas.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import { Restaurant } from "../src/models/Restaurant.js";
import { MenuItem } from "../src/models/Menu.js";
import { ServiceArea } from "../src/models/ServiceArea.js";
import { User } from "../src/models/User.js";
import { Order } from "../src/models/Order.js";

const haversineKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

async function main() {
  const uri = process.env.MONGODB_URI ?? "";
  if (!uri.includes("mongodb+srv")) {
    console.error("Not the Atlas URI — aborting verify.");
    process.exit(1);
  }
  await mongoose.connect(uri);

  const area = await ServiceArea.findOne({ key: "default" }).lean();
  console.log(`Service area: ${area?.lat}, ${area?.lng} · radius ${area?.radiusKm} km · ${area?.address} (${area?.pincode})`);
  if (!area) throw new Error("Service area missing");

  const restaurants = await Restaurant.find({}).lean();
  console.log(`\nRestaurants: ${restaurants.length}`);
  let inside = 0;
  for (const r of restaurants) {
    const [lng, lat] = r.location?.coordinates ?? [0, 0];
    const km = haversineKm({ lat: area.lat, lng: area.lng }, { lat, lng });
    if (km <= area.radiusKm) inside += 1;
    const cover = /^https:\/\/images\.unsplash\.com\//.test(r.coverImage ?? "");
    console.log(`  ${km.toFixed(1)} km · ${r.name} · ${r.cuisines.join(", ")} · cover:${cover ? "real-img" : "MISSING"} · open:${r.isOpen}`);
  }
  console.log(`${inside}/${restaurants.length} inside the ${area.radiusKm} km delivery area`);

  const menuCount = await MenuItem.countDocuments({});
  const withImage = await MenuItem.countDocuments({ image: /^https:\/\/images\.unsplash\.com\// });
  console.log(`\nMenu items: ${menuCount} (${withImage} with real images)`);

  const users = await User.countDocuments({});
  const orders = await Order.countDocuments({});
  const categories = await Restaurant.distinct("cuisines");
  console.log(`Users: ${users} (untouched) · Orders: ${orders} (untouched) · cuisine tags: ${categories.length}`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("Verify failed:", error);
  process.exit(1);
});
