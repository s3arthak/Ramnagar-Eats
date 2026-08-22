import mongoose from "mongoose";

const MONGO_URI =
  "mongodb+srv://kharkasarthak_db_user:jndtOGExOIWQKjo3@cluster0.dsfzkf3.mongodb.net/ramnagar-eats?appName=Cluster0";

async function fixAdmin() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  // Find all users with this email
  const users = await db.collection("users").find({ email: "ramnagareats@gmail.com" }).toArray();
  console.log("Users with ramnagareats@gmail.com:", users.map(u => ({ id: u._id, name: u.name, email: u.email, role: u.role })));

  if (users.length === 0) {
    console.log("No user found with this email. Creating ADMIN user...");
    const result = await db.collection("users").insertOne({
      name: "Platform Admin",
      phone: "+919876500002",
      email: "ramnagareats@gmail.com",
      emailVerified: true,
      role: "ADMIN",
      createdAt: new Date(),
    });
    console.log("Created admin user:", result.insertedId);
  } else {
    // If there are multiple, keep only the ADMIN one and delete the rest
    for (const user of users) {
      if (user.role !== "ADMIN") {
        console.log(`Deleting non-ADMIN user: ${user._id} (role: ${user.role})`);
        await db.collection("users").deleteOne({ _id: user._id });
      }
    }

    // Ensure the ADMIN user exists
    const adminUser = users.find(u => u.role === "ADMIN");
    if (adminUser) {
      console.log("Admin user already exists:", adminUser._id);
    } else {
      console.log("No ADMIN role user found. Updating the first user to ADMIN...");
      await db.collection("users").updateOne(
        { email: "ramnagareats@gmail.com" },
        { $set: { role: "ADMIN" } }
      );
    }
  }

  // Final verification
  const finalUser = await db.collection("users").findOne({ email: "ramnagareats@gmail.com" });
  console.log("\nFinal state:", { id: finalUser?._id, name: finalUser?.name, email: finalUser?.email, role: finalUser?.role });

  await mongoose.disconnect();
}

fixAdmin().catch(console.error);
