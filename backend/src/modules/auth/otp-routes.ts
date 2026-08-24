import { randomBytes } from "node:crypto";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { isProduction } from "../../config.js";
import { signAccessToken } from "../../middleware/auth.js";
import { User, type UserRole } from "../../models/User.js";
import { emailService } from "../../services/email.js";
import { devCodeStore, otpErrors, sendOtpEmail, verifyOtp } from "../../services/otp.js";
import { ApiError, badRequest, conflict, notFound, ok } from "../../utils/errors.js";
import { hashPassword } from "../../utils/password.js";
import { normalizePhone } from "../../utils/phone.js";

const router = Router();

const emailSchema = z.string().email("Enter a valid email").transform((value) => value.trim().toLowerCase());
const codeSchema = z.string().regex(/^\d{6}$/, "Enter the 6-digit code");

const sendOtpSchema = z.object({ email: emailSchema });
const verifyOtpSchema = z.object({ email: emailSchema, code: codeSchema, role: z.enum(["CUSTOMER", "RESTAURANT", "RIDER", "ADMIN"]).optional() });
const registerSchema = z.object({
  email: emailSchema,
  /** Short-lived token proving the email was verified by OTP. */
  regToken: z.string().min(10),
  name: z.string().trim().min(2, "Enter your name").max(80),
  phone: z.string().min(7).max(20).optional().or(z.literal("")),
  role: z.enum(["CUSTOMER", "RESTAURANT", "RIDER"]).default("CUSTOMER"),
});

const secret = () => process.env.JWT_SECRET ?? "local-development-secret-change-me";

/** One-time token proving the email passed OTP verification. */
function signRegistrationToken(email: string) {
  return jwt.sign({ sub: email, purpose: "otp-verified" }, secret(), { expiresIn: "10m" });
}

function verifyRegistrationToken(token: string, email: string): boolean {
  try {
    const payload = jwt.verify(token, secret()) as jwt.JwtPayload;
    return payload.purpose === "otp-verified" && payload.sub === email;
  } catch {
    return false;
  }
}

const publicUser = (user: any) => ({
  id: user.id,
  name: user.name,
  phone: user.phone ?? undefined,
  email: user.email ?? undefined,
  role: user.role,
  vehicleType: user.vehicleType ?? undefined,
  vehicleNumber: user.vehicleNumber ?? undefined,
  deliveryArea: user.deliveryArea ?? undefined,
  riderStatus: user.riderStatus ?? undefined,
  riderApproval: user.riderApproval ?? undefined,
});

router.post(
  "/send-otp",
  async (request, response, next) => {
    try {
      const parsed = sendOtpSchema.safeParse(request.body);
      if (!parsed.success) throw badRequest("Enter a valid email", "VALIDATION_ERROR");
      await sendOtpEmail(parsed.data.email);
      // Never reveal whether the account exists.
      return ok(response, { message: "Verification code sent" });
    } catch (error) {
      next(error);
    }
  },
);

// Dev/E2E: check OTP delivery status for an email (was the code actually created?).
if (!isProduction) {
  router.get(
    "/otp-status",
    async (request, response, next) => {
      try {
        const email = String(request.query.email ?? "").trim().toLowerCase();
        if (!email.includes("@")) throw badRequest("email is required", "VALIDATION_ERROR");
        const code = devCodeStore.lastCode(email);
        return ok(response, { email, status: code ? "sent" : "not_sent" });
      } catch (error) {
        next(error);
      }
    },
  );
}

router.post(
  "/verify-otp",
  async (request, response, next) => {
    try {
      const parsed = verifyOtpSchema.safeParse(request.body);
      if (!parsed.success) throw badRequest("Enter the 6-digit code", "VALIDATION_ERROR");
      const email = parsed.data.email;
      const result = await verifyOtp(email, parsed.data.code);
      if (result !== "OK") {
        const error = otpErrors[result];
        throw new ApiError(error.status, error.message, error.code);
      }

      let user: InstanceType<typeof User> | null = null;
      if (parsed.data.role) {
        // Role explicitly provided (e.g. cross-role tests, restaurant/rider apps):
        // match by email + role strictly.
        user = await User.findOne({ email, role: parsed.data.role });
      } else {
        // No role sent (customer-web default): find any user with this email.
        // This lets ADMIN / RESTAURANT / RIDER users sign in through any portal
        // without the frontend needing to know which role to send.
        user = await User.findOne({ email });
      }
      if (user) {
        return ok(response, { token: signAccessToken(user.id, user.role), user: publicUser(user), isNew: false, message: "Signed in" });
      }
      // New email: hand back a short-lived registration token; the account is
      // only created once the user provides their name (and optionally phone).
      return ok(response, { regToken: signRegistrationToken(email), isNew: true, message: "Almost there — tell us who you are" });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/register",
  async (request, response, next) => {
    try {
      const parsed = registerSchema.safeParse(request.body);
      if (!parsed.success) throw badRequest(parsed.error.issues[0].message, "VALIDATION_ERROR");
      const { name, role } = parsed.data;
      const email = parsed.data.email;
      let phone: string | undefined;
      if (parsed.data.phone?.trim()) {
        try {
          phone = normalizePhone(parsed.data.phone);
        } catch (caught) {
          throw badRequest(caught instanceof Error ? caught.message : "Enter a valid phone number", "VALIDATION_ERROR");
        }
      }
      if (!verifyRegistrationToken(parsed.data.regToken, email)) {
        throw badRequest("Your verification has expired. Request a new code and try again.", "REGISTRATION_TOKEN_INVALID");
      }
      // Role is backend-controlled: the schema only accepts CUSTOMER/RESTAURANT,
      // so a client can never create an ADMIN account.
      const existing = await User.findOne({ $or: [{ email, role }, ...(phone ? [{ phone, role }] : [])] });
      if (existing) throw conflict(existing.email === email ? `That email is already registered as ${role}. Sign in instead.` : "That phone number is already in use for this role.", "ACCOUNT_EXISTS");

      let user: InstanceType<typeof User>;
      try {
        user = await User.create({
          name,
          email,
          phone,
          emailVerified: true,
          // No passwords in V2 — a random hash satisfies the schema and is never usable.
          passwordHash: hashPassword(randomBytes(24).toString("hex")),
          role,
        });
      } catch (createError: any) {
        // Handle the race condition where two concurrent registrations
        // both pass the findOne check but the second hits the unique index.
        if (createError?.code === 11000) {
          const already = await User.findOne({ $or: [{ email, role }, ...(phone ? [{ phone, role }] : [])] });
          if (already) {
            // The account now exists — the user can sign in with it.
            return ok(response, { token: signAccessToken(already.id, already.role), user: publicUser(already), message: "Account already exists — signed in" });
          }
        }
        throw createError;
      }
      void emailService.sendWelcome(email, user.name).catch(() => undefined);
      return ok(response, { token: signAccessToken(user.id, user.role), user: publicUser(user), message: "Account created" }, 201);
    } catch (error) {
      next(error);
    }
  },
);

// ---------------- Google OAuth ----------------

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

const webUrlFor = (app: string) => {
  if (app === "restaurant") return process.env.RESTAURANT_WEB_URL ?? "http://localhost:3001";
  if (app === "rider") return process.env.RIDER_WEB_URL ?? "http://localhost:3002";
  return process.env.CUSTOMER_WEB_URL ?? "http://localhost:3000";
};

const redirectUri = () => process.env.GOOGLE_REDIRECT_URI ?? `${process.env.PUBLIC_API_URL ?? "http://localhost:5000"}/api/v1/auth/google/callback`;

interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
  email_verified: boolean;
}

async function exchangeGoogleCode(code: string): Promise<{ access_token: string }> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) throw new ApiError(401, "Google sign-in failed", "GOOGLE_OAUTH_FAILED");
  return (await response.json()) as { access_token: string };
}

async function fetchGoogleProfile(accessToken: string): Promise<GoogleProfile> {
  const response = await fetch(GOOGLE_USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new ApiError(401, "Could not fetch your Google profile", "GOOGLE_OAUTH_FAILED");
  return (await response.json()) as GoogleProfile;
}

/** Shared post-OAuth handling: find or create the account, then redirect with a session. */  async function handleGoogleProfile(profile: GoogleProfile, app: string, response: any) {
    if (!profile.email || !profile.email_verified) {
      return response.redirect(`${webUrlFor(app)}/oauth/callback?error=Google email is not verified`);
    }
    const email = profile.email.toLowerCase();
    const roleMap: Record<string, string> = { restaurant: "RESTAURANT", rider: "RIDER" };
    const role = (roleMap[app] as any) ?? "CUSTOMER";
    // Look up by email+role so the same email can have separate customer/rider/restaurant accounts.
    // For restaurant/rider apps, also check for ADMIN role — the admin email
    // (ramnagareats@admin.com) should route to admin regardless of which app
    // initiates Google OAuth. CUSTOMER-only matches are excluded to avoid
    // returning the wrong account type.
    let user: InstanceType<typeof User> | null = null;
    if (app === "customer") {
      user = await User.findOne({ email, role: "CUSTOMER" });
    } else {
      user = await User.findOne({ email, role }) ?? await User.findOne({ email, role: "ADMIN" });
    }
    const isNew = !user;
    if (!user) {
      try {
        user = await User.create({
          name: profile.name || email.split("@")[0],
          email,
          googleId: profile.sub,
          emailVerified: true,
          passwordHash: hashPassword(randomBytes(24).toString("hex")),
          role,
        });
      } catch (createError: any) {
        // Handle race condition: another request created the same user between
        // our findOne and create. Fall back to finding the existing account.
        if (createError?.code === 11000) {
          user = await User.findOne({ email, role });
          if (!user) {
            return response.redirect(`${webUrlFor(app)}/oauth/callback?error=Could not create account — try signing in with email instead`);
          }
        } else {
          return response.redirect(`${webUrlFor(app)}/oauth/callback?error=Could not create account`);
        }
      }
    }
    const token = signAccessToken(user.id, user.role);
    const payload = encodeURIComponent(JSON.stringify({ id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, avatar: user.avatar }));
    return response.redirect(`${webUrlFor(app)}/oauth/callback?token=${token}&user=${payload}&isNew=${isNew}`);
  }

// Start the OAuth dance: redirect to Google with a state that encodes the target app.
router.get(
  "/google",
  async (request, response, next) => {
    try {
      const app = String(request.query.app ?? "customer");
      if (!["customer", "restaurant", "rider"].includes(app)) throw badRequest("Unknown app", "VALIDATION_ERROR");
      if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        throw new ApiError(503, "Google sign-in is not configured on this server", "GOOGLE_NOT_CONFIGURED");
      }
      const state = Buffer.from(JSON.stringify({ app, nonce: randomBytes(8).toString("hex") })).toString("base64url");
      const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri(),
        response_type: "code",
        scope: "openid email profile",
        state,
        prompt: "select_account",
      });
      return response.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/google/callback",
  async (request, response, next) => {
    try {
      const { code, state } = request.query as { code?: string; state?: string };
      if (!code || !state) throw new ApiError(400, "Incomplete Google sign-in", "GOOGLE_OAUTH_FAILED");
      let app = "customer";
      try {
        app = (JSON.parse(Buffer.from(state, "base64url").toString()) as { app: string }).app;
      } catch {
        /* fall back to customer */
      }
      const tokens = await exchangeGoogleCode(code);
      const profile = await fetchGoogleProfile(tokens.access_token);
      return await handleGoogleProfile(profile, app, response);
    } catch (error) {
      next(error);
    }
  },
);

// Development / E2E helper: simulate the Google callback without real Google.
// Compiled out in production.
if (!isProduction) {
  router.get(
    "/google/dev-callback",
    async (request, response, next) => {
      try {
        const app = String(request.query.app ?? "customer");
        const email = String(request.query.email ?? "").toLowerCase();
        if (!email.includes("@")) throw badRequest("email is required", "VALIDATION_ERROR");
        const profile: GoogleProfile = {
          sub: `dev-google-${Buffer.from(email).toString("hex")}`,
          email,
          name: String(request.query.name ?? email.split("@")[0]),
          email_verified: true,
        };
        return await handleGoogleProfile(profile, app, response);
      } catch (error) {
        next(error);
      }
    },
  );

  // Development / E2E helper: read the last code sent to an email.
  router.get(
    "/dev-otp",
    async (request, response, next) => {
      try {
        const email = String(request.query.email ?? "").trim().toLowerCase();
        const code = devCodeStore.lastCode(email);
        if (!code) throw notFound("No code sent to this email yet", "OTP_NOT_FOUND");
        return ok(response, { email, code, note: "Development only — never enabled in production" });
      } catch (error) {
        next(error);
      }
    },
  );
}

export default router;
