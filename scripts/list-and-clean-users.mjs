import mongoose from "mongoose";

const MONGO_URI =
  "mongodb+srv://kharkasarthak_db_user:jndtOGExOIWQKjo3@cluster0.dsfzkf3.mongodb.net/ramnagar-eats?appName=Cluster0";

async function main() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  // Step 1: List all users
  const allUsers = await db.collection("users").find({}).toArray();
  console.log(`\nTotal users in DB: ${allUsers.length}\n`);
  console.log("All users:");
  for (const u of allUsers) {
    console.log(`  - ${u.name} | ${u.email} | role: ${u.role} | id: ${u._id}`);
  }

  // Step 2: Find the admin to keep
  const admin = allUsers.find(u => u.email === "ramnangareats@gmail.com" && u.role === "ADMIN");
  if (!admin) {
    console.log("\n⚠️  No ADMIN user with ramnangareats@gmail.com found! Aborting.");
    await mongoose.disconnect();
    return;
  }
  console.log(`\n✅ Keeping admin: ${admin.name} (${admin.email}, role: ${admin.role})`);

  // Step 3: Delete all non-admin users
  const result = await db.collection("users").deleteMany({
    _id: { $ne: admin._id },
  });
  console.log(`\n🗑️  Deleted ${result.deletedCount} users`);

  // Step 4: Verify
  const remaining = await db.collection("users").find({}).toArray();
  console.log(`\nRemaining users: ${remaining.length}`);
  for (const u of remaining) {
    console.log(`  - ${u.name} | ${u.email} | role: ${u.role}`);
  }

  await mongoose.disconnect();
}

main().catch(console.error);
