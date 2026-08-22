import mongoose from "mongoose";

const MONGO_URI = "mongodb+srv://kharkasarthak_db_user:jndtOGExOIWQKjo3@cluster0.dsfzkf3.mongodb.net/ramnagar-eats?appName=Cluster0";

async function updateAdminEmail() {
  await mongoose.connect(MONGO_URI);
  
  const result = await mongoose.connection.db.collection("users").updateOne(
    { email: "admin@ramnagareats.test", role: "ADMIN" },
    { $set: { email: "ramnagareats@gmail.com" } }
  );
  
  console.log("Update result:", result);
  
  // Verify
  const admin = await mongoose.connection.db.collection("users").findOne({ role: "ADMIN" });
  console.log("Admin user now:", { email: admin?.email, name: admin?.name, role: admin?.role });
  
  await mongoose.disconnect();
}

updateAdminEmail().catch(console.error);
