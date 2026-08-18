import path from "node:path";
import compression from "compression";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import mongoose from "mongoose";
import { config } from "./config.js";
import adminRoutes from "./modules/admin/routes.js";
import authRoutes from "./modules/auth/routes.js";
import otpAuthRoutes from "./modules/auth/otp-routes.js";
import categoryRoutes from "./modules/categories/routes.js";
import configRoutes from "./modules/config/routes.js";
import couponRoutes from "./modules/coupons/routes.js";
import locationRoutes from "./modules/locations/routes.js";
import orderRoutes from "./modules/orders/routes.js";
import restaurantRoutes from "./modules/restaurants/routes.js";
import restaurantOwnerRoutes from "./modules/restaurant/routes.js";
import uploadRoutes from "./modules/uploads/routes.js";
import pushRoutes from "./modules/push/routes.js";
import userRoutes from "./modules/users/routes.js";
import { errorHandler } from "./utils/errors.js";
import { requestLogger } from "./utils/logger.js";

export const app = express();

// Trust the reverse proxy (nginx) so rate limits and IPs are accurate in production.
app.set("trust proxy", config.env === "production" ? 1 : false);

app.use(helmet());
app.use(compression());
app.use(
  cors({
    origin: config.corsOrigins,
    credentials: true,
  }),
);
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));

if (config.env !== "test") {
  app.use(requestLogger);
}

if (config.env !== "test") {
  // General API rate limit.
  app.use(
    "/api",
    rateLimit({
      windowMs: config.rateLimitWindowMs,
      limit: config.rateLimitMax,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { success: false, message: "Too many requests, please slow down", code: "RATE_LIMITED" },
    }),
  );

  // Stricter limit on auth endpoints to slow down credential stuffing.
  app.use(
    "/api/v1/auth",
    rateLimit({
      windowMs: config.authRateLimitWindowMs,
      limit: config.authRateLimitMax,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      skipSuccessfulRequests: true,
      message: { success: false, message: "Too many attempts, please try again later", code: "RATE_LIMITED" },
    }),
  );
}

app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/auth", otpAuthRoutes);
app.use("/api/v1/config", configRoutes);
app.use("/api/v1/coupons", couponRoutes);
app.use("/api/v1/orders", orderRoutes);
app.use("/api/v1/restaurant", restaurantOwnerRoutes);
app.use("/api/v1/restaurants", restaurantRoutes);
app.use("/api/v1/uploads", uploadRoutes);
app.use("/api/v1/categories", categoryRoutes);
app.use("/api/v1/locations", locationRoutes);
app.use("/api/v1/push", pushRoutes);
app.use("/api/v1/users", userRoutes);

app.get("/api/v1/health", (_request, response) => {
  response.status(200).json({
    status: "ok",
    service: "ramnagar-eats-api",
    environment: config.env,
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  });
});

// 404 for unknown API routes, then the central error handler.
// Locally stored uploads (dev provider) are served from /uploads.
// Helmet defaults Cross-Origin-Resource-Policy to same-origin, which would
// stop the web apps (different ports/origins) from rendering these images —
// relax it for this static route only, like an image CDN.
app.use("/uploads", (_request, response, next) => {
  response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
});
app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads"), { maxAge: "7d", immutable: true }));

app.use("/api", (_request, response) => response.status(404).json({ success: false, message: "API route not found", code: "NOT_FOUND" }));
app.use(errorHandler);
