import mongoose from "mongoose";

const MONGO_URI =
  "mongodb+srv://kharkasarthak_db_user:jndtOGExOIWQKjo3@cluster0.dsfzkf3.mongodb.net/ramnagar-eats?appName=Cluster0";

async function assignOwner() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  // Find the user
  const user = await db
    .collection("users")
    .findOne({ email: "kharkasarthak@gmail.com" });
  if (!user) {
    console.error("User kharkasarthak@gmail.com not found!");
    process.exit(1);
  }
  console.log("Found user:", { id: user._id, email: user.email, name: user.name });

  // Find Royal Biryani House
  const restaurant = await db
    .collection("restaurants")
    .findOne({ name: "Royal Biryani House" });
  if (!restaurant) {
    console.error("Restaurant 'Royal Biryani House' not found!");
    process.exit(1);
  }
  console.log("Found restaurant:", { id: restaurant._id, name: restaurant.name, ownerId: restaurant.ownerId });

  // Update restaurant ownership
  const result = await db
    .collection("restaurants")
    .updateOne(
      { _id: restaurant._id },
      { $set: { ownerId: user._id } }
    );

  console.log("Update result:", result);

  // Verify
  const updated = await db
    .collection("restaurants")
    .findOne({ name: "Royal Biryani House" });
  console.log("Verified restaurant:", { name: updated.name, ownerId: updated.ownerId });

  await mongoose.disconnect();
}

assignOwner().catch(console.error);
