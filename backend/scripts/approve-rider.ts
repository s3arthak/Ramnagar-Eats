import "dotenv/config";
import mongoose from "mongoose";
import { User } from "../src/models/User.js";

const email = process.argv[2];
if (!email) {
  console.error("Usage: tsx scripts/approve-rider.ts <email>");
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI ?? "mongodb://localhost:27017/ramnagar-eats");

const rider = await User.findOneAndUpdate(
  { email: email.toLowerCase(), role: "RIDER" },
  { $set: { riderApproval: "APPROVED" } },
  { returnDocument: "after" },
);

if (!rider) {
  console.error(`No rider found with email: ${email}`);
  process.exit(1);
}

console.log(`✅ Rider approved: ${rider.name} (${rider.email}) — status: ${rider.riderApproval}`);
await mongoose.disconnect();
