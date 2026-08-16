import "dotenv/config";
import mongoose from "mongoose";
import { createAppServer } from "./http-server.js";

const port = Number(process.env.PORT ?? 5000);
const mongoUri = process.env.MONGODB_URI;

async function start() {
  if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET must be configured in production");
  }
  if (mongoUri) {
    try {
      await mongoose.connect(mongoUri);
      console.info("MongoDB connected");
    } catch (error) {
      console.error("MongoDB connection failed; API will start without a database.", error);
    }
  }

  const { server } = createAppServer();
  server.listen(port, () => {
    console.info(`API listening at http://localhost:${port}`);
  });

  const shutdown = async (signal: string) => {
    console.info(`${signal} received, shutting down gracefully…`);
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void start();
