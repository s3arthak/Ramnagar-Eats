/** Central, env-driven configuration. All values have safe local-dev defaults. */

function csv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export const config = {
  env: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 5000),
  mongoUri: process.env.MONGODB_URI,
  /** Mapbox Directions token — enables real road routes; absent falls back to a geodesic route. */
  mapboxAccessToken: process.env.MAPBOX_ACCESS_TOKEN,
  jwtSecret: process.env.JWT_SECRET ?? "local-dev-secret-change-me",
  /** Display brand name used in transactional copy. */
  brandName: process.env.BRAND_NAME ?? "Ramnagar Eats",
  /** Currency symbol shown to users (India default). */
  currency: process.env.CURRENCY_SYMBOL ?? "₹",
  /** Prefix for human-readable order numbers. */
  orderPrefix: process.env.ORDER_PREFIX ?? "RE-",
  /** Default country code (no +) for bare 10-digit phone numbers. */
  phoneCountryCode: process.env.PHONE_COUNTRY_CODE ?? "91",
  /** Comma-separated list of allowed browser origins. */
  corsOrigins: csv(process.env.CORS_ORIGINS).length > 0 ? csv(process.env.CORS_ORIGINS) : ["http://localhost:3000", "http://localhost:3001"],
  /** General API rate limit. */
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX ?? 300),
  /** Stricter limit for auth endpoints (login / register). */
  authRateLimitWindowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? 60_000),
  authRateLimitMax: Number(process.env.AUTH_RATE_LIMIT_MAX ?? 10),
  otp: {
    ttlMs: Number(process.env.OTP_TTL_MS ?? 5 * 60_000),
    maxAttempts: Number(process.env.OTP_MAX_ATTEMPTS ?? 5),
    resendCooldownMs: Number(process.env.OTP_RESEND_COOLDOWN_MS ?? 60_000),
  },
  /** Read live so tests (and hot env changes) take effect without a restart. */
  get serviceCenter() {
    return {
      lat: Number(process.env.SERVICE_CENTER_LAT ?? 19.076),
      lng: Number(process.env.SERVICE_CENTER_LNG ?? 72.8777),
    };
  },
  get service() {
    return {
      radiusKm: Number(process.env.SERVICE_RADIUS_KM ?? 10),
      baseDeliveryFee: Number(process.env.BASE_DELIVERY_FEE ?? 20),
      freeDeliveryAbove: Number(process.env.DELIVERY_FEE_FREE_ABOVE ?? 0),
    };
  },
};

export const isProduction = config.env === "production";
