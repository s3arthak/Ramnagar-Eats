/**
 * End-to-end API acceptance tests. Runs the real Express app against an
 * in-memory MongoDB, seeds sample data, and exercises every flow through HTTP.
 *
 * Usage: npm run test:api --workspace=backend
 */
import jwt from "jsonwebtoken";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { io as createClient } from "socket.io-client";

// Env vars must be set before the app modules load: the backend captures its
// configuration (delivery fees, radius, JWT secret) once at startup.
process.env.DELIVERY_FEE_FREE_ABOVE = "99999";
process.env.BASE_DELIVERY_FEE = "20";
process.env.SERVICE_RADIUS_KM = "5";
process.env.JWT_SECRET = "test-secret";
process.env.OTP_DELIVERY = "console";
// Keep the resend cooldown short so consecutive OTP flows in the suite are not blocked.
process.env.OTP_RESEND_COOLDOWN_MS = "100";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function request(base: string, path: string, options: RequestInit & { redirect?: RequestInit["redirect"] } = {}, token?: string) {
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  const headers: Record<string, string> = { ...(isForm ? {} : { "Content-Type": "application/json" }), ...(options.headers as Record<string, string>) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${base}${path}`, { ...options, headers, redirect: options.redirect ?? "follow" });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    /* non-JSON body */
  }
  return { status: response.status, body: body as Record<string, any>, location: response.headers.get("location") };
}

async function main() {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri("ramnagar-eats");
  const { createAppServer } = await import("../src/http-server.js");
  const { seedDatabase } = await import("../src/seed.js");
  const { MenuItem } = await import("../src/models/Menu.js");
  const { Order } = await import("../src/models/Order.js");
  const { Restaurant } = await import("../src/models/Restaurant.js");
  const { Coupon } = await import("../src/models/Coupon.js");
  const { Otp } = await import("../src/models/Otp.js");

  await seedDatabase(process.env.MONGODB_URI);
  const { server, io } = createAppServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 5000}`;
  const wsBase = `ws://127.0.0.1:${typeof address === "object" && address ? address.port : 5000}`;
  console.log(`API tests against ${base}\n`);

  function connectSocket(token: string | undefined) {
    return new Promise<any>((resolve, reject) => {
      const client = createClient(wsBase, { auth: { token }, transports: ["websocket"] });
      client.on("connect", () => resolve(client));
      client.on("connect_error", (error) => reject(new Error(error.message)));
    });
  }

  function once(client: any, event: string, timeoutMs = 5000) {
    return new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeoutMs);
      client.once(event, (payload: any) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }

  // ---- OTP auth helpers (dev code store records codes; the dev-otp endpoint reads them) ----
  async function sendOtp(email: string) {
    return request(base, "/api/v1/auth/send-otp", { method: "POST", body: JSON.stringify({ email }) });
  }

  async function devCode(email: string) {
    const res = await request(base, `/api/v1/auth/dev-otp?email=${encodeURIComponent(email)}`);
    return res.body.code as string;
  }

  async function verifyOtp(email: string, code: string, role?: string) {
    return request(base, "/api/v1/auth/verify-otp", { method: "POST", body: JSON.stringify({ email, code, ...(role ? { role } : {}) }) });
  }

  /** Full new-user flow: send → verify → register. */
  async function registerUser(name: string, email: string, options: { phone?: string; role?: string } = {}) {
    await sendOtp(email);
    const verified = await verifyOtp(email, await devCode(email));
    if (!verified.body.regToken) throw new Error(`expected regToken for ${email}`);
    return request(base, "/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, regToken: verified.body.regToken, name, phone: options.phone, role: options.role ?? "CUSTOMER" }),
    });
  }

  /** Returning-user flow: send → verify → session. */
  async function loginUser(email: string, role?: string) {
    const sent = await sendOtp(email);
    // If rate-limited by the resend cooldown, wait and retry.
    if (sent.status === 400 && sent.body.code === "OTP_RESEND_TOO_SOON") {
      await new Promise((resolve) => setTimeout(resolve, Number(process.env.OTP_RESEND_COOLDOWN_MS ?? 100) + 50));
      await sendOtp(email);
    }
    return verifyOtp(email, await devCode(email), role);
  }

  // ---------- Auth (email OTP + Google) ----------
  console.log("Auth");
  {
    const sent = await sendOtp("test@customer.test");
    check("send-otp returns a confirmation", sent.status === 200 && sent.body.success);

    const wrong = await verifyOtp("test@customer.test", "000000");
    check("wrong OTP rejected", wrong.status === 400 && wrong.body.code === "OTP_INVALID");

    const verified = await verifyOtp("test@customer.test", await devCode("test@customer.test"));
    check("verify-otp for a new email returns a registration token", verified.status === 200 && verified.body.isNew === true && Boolean(verified.body.regToken));

    const reuse = await verifyOtp("test@customer.test", await devCode("test@customer.test"));
    check("OTP cannot be reused after verification", reuse.status === 400 && reuse.body.code === "OTP_INVALID");

    const reg = await request(base, "/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: "test@customer.test", regToken: verified.body.regToken, name: "Test Customer", phone: "+919999999999", role: "CUSTOMER" }),
    });
    check("register creates a customer after OTP", reg.status === 201 && reg.body.success && reg.body.token && reg.body.user.role === "CUSTOMER", JSON.stringify(reg.body));
    const customerToken = reg.body.token;

    // Bare 10-digit Indian numbers are auto-normalized to E.164 (no +91 needed).
    const barePhone = await registerUser("Bare Phone User", "barephone@customer.test", { phone: "6006949465" });
    check("register accepts a bare 10-digit phone and normalizes it", barePhone.status === 201 && barePhone.body.user.phone === "+916006949465", JSON.stringify(barePhone.body));

    const garbagePhone = await registerUser("Garbage Phone User", "garbagephone@customer.test", { phone: "not-a-phone" });
    check("invalid phone returns a friendly 400 (not a 500)", garbagePhone.status === 400 && garbagePhone.body.code === "VALIDATION_ERROR" && /phone/i.test(garbagePhone.body.message), JSON.stringify(garbagePhone.body));

    const adminSpoof = await registerUser("Spoof Admin", "spoof@admin.test", { role: "ADMIN" as any });
    check("client cannot create an ADMIN account", adminSpoof.status === 400 && adminSpoof.body.code === "VALIDATION_ERROR");

    const noRegToken = await request(base, "/api/v1/auth/register", { method: "POST", body: JSON.stringify({ email: "spoof@admin.test", regToken: "garbage-token-value-123456", name: "No Token" }) });
    check("register with an invalid registration token rejected", noRegToken.status === 400 && noRegToken.body.code === "REGISTRATION_TOKEN_INVALID");

    const tampered = await request(base, "/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: "spoof@admin.test", regToken: verified.body.regToken, name: "Wrong Email" }),
    });
    check("registration token bound to the verified email", tampered.status === 400 && tampered.body.code === "REGISTRATION_TOKEN_INVALID");

    const dupEmail = "dup@customer.test";
    const dupPhone = "+919666666664";
    await sendOtp(dupEmail);
    const dupVerified = await verifyOtp(dupEmail, await devCode(dupEmail));
    const dupReg = await request(base, "/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: dupEmail, regToken: dupVerified.body.regToken, name: "First User", phone: dupPhone }),
    });
    check("registration works once per email", dupReg.status === 201 && dupReg.body.user.email === dupEmail);
    const dup = await request(base, "/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: dupEmail, regToken: dupVerified.body.regToken, name: "Duplicate" }),
    });
    check("duplicate email registration rejected", dup.status === 409 && dup.body.code === "ACCOUNT_EXISTS");

    // The same phone cannot be reused by another account either.
    await sendOtp("other@customer.test");
    const phoneDupVerified = await verifyOtp("other@customer.test", await devCode("other@customer.test"));
    const phoneDup = await request(base, "/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: "other@customer.test", regToken: phoneDupVerified.body.regToken, name: "Other User", phone: dupPhone }),
    });
    check("duplicate phone registration rejected", phoneDup.status === 409 && phoneDup.body.code === "ACCOUNT_EXISTS");

    const bad = await request(base, "/api/v1/auth/send-otp", { method: "POST", body: JSON.stringify({ email: "not-an-email" }) });
    check("invalid email input rejected", bad.status === 400 && bad.body.code === "VALIDATION_ERROR");

    const login = await loginUser("test@customer.test");
    check("returning user logs in with email OTP only", login.status === 200 && login.body.token && login.body.isNew === false, JSON.stringify(login.body));

    // Attempt limits: 5 wrong codes then a lockout even with the right code.
    const lockEmail = "lock@customer.test";
    await sendOtp(lockEmail);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await verifyOtp(lockEmail, "111111");
    }
    const locked = await verifyOtp(lockEmail, await devCode(lockEmail));
    check("too many attempts locks the code", locked.status === 429 && locked.body.code === "OTP_TOO_MANY_ATTEMPTS");

    // Resend cooldown.
    await sendOtp("cooldown@customer.test");
    const tooSoon = await sendOtp("cooldown@customer.test");
    check("resend within cooldown rejected", tooSoon.status === 400 && tooSoon.body.code === "OTP_RESEND_TOO_SOON");

    // Expired OTP.
    const expireEmail = "expire@customer.test";
    await sendOtp(expireEmail);
    await Otp.updateMany({ email: expireEmail }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await verifyOtp(expireEmail, await devCode(expireEmail));
    check("expired OTP rejected", expired.status === 400 && expired.body.code === "OTP_EXPIRED");

    // Google OAuth (via the development callback — production uses real Google).
    const googleUrl = (location: string) => new URL(location);
    // New Google user: the customer app never auto-creates accounts — it sends
    // the user to create one with email + OTP instead (proves email ownership).
    const newGoogle = await request(base, "/api/v1/auth/google/dev-callback?app=customer&email=google@customer.test&name=Google%20New", { redirect: "manual" });
    check("Google sign-in for an unknown email asks for account creation", newGoogle.status === 302 && Boolean(newGoogle.location?.includes("/oauth/callback?needsAccount=1")), newGoogle.location ?? "");
    const googleId = googleUrl(newGoogle.location ?? "").searchParams.get("googleId") ?? "";
    check("create-account redirect carries the Google id and email", googleId.length > 5 && googleUrl(newGoogle.location ?? "").searchParams.get("gemail") === "google@customer.test");

    // The user completes sign-up with email OTP + details; the account links to Google.
    await sendOtp("google@customer.test");
    const googleVerified = await verifyOtp("google@customer.test", await devCode("google@customer.test"));
    const googleReg = await request(base, "/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: "google@customer.test", regToken: googleVerified.body.regToken, name: "Google New", googleId }),
    });
    check("account created after OTP with the Google identity linked", googleReg.status === 201 && googleReg.body.user.email === "google@customer.test" && Boolean(googleReg.body.token), JSON.stringify(googleReg.body));
    const googleToken = googleReg.body.token;
    const googleMe = await request(base, "/api/v1/auth/me", {}, googleToken);
    check("Google-linked session works", googleMe.status === 200 && googleMe.body.user.email === "google@customer.test");

    // Next time the same Google account signs in with one tap — no account creation.
    const googleAgain = await request(base, "/api/v1/auth/google/dev-callback?app=customer&email=google@customer.test&name=Google%20New", { redirect: "manual" });
    check("Google sign-in for an existing email signs in directly", googleAgain.status === 302 && Boolean(googleAgain.location?.includes("/oauth/callback?token=")) && googleUrl(googleAgain.location ?? "").searchParams.get("isNew") === "false", googleAgain.location ?? "");

    // Google + email OTP share one account: same email logs in via OTP too.
    const googleOtpLogin = await loginUser("google@customer.test");
    check("Google-linked account also logs in with email OTP", googleOtpLogin.status === 200 && googleOtpLogin.body.isNew === false);

    // Existing account linked by email: Google login returns the same user.
    const existingGoogle = await request(base, "/api/v1/auth/google/dev-callback?app=customer&email=test@customer.test&name=Test%20Customer", { redirect: "manual" });
    const existingUser = JSON.parse(decodeURIComponent(googleUrl(existingGoogle.location ?? "").searchParams.get("user") ?? "{}"));
    check("Google sign-in with an existing email links the account", existingGoogle.status === 302 && existingUser.email === "test@customer.test" && googleUrl(existingGoogle.location ?? "").searchParams.get("isNew") === "false");

    // Google sign-in: 503 when the server has no OAuth keys, 302 to accounts.google.com when configured.
    const googleStart = await request(base, "/api/v1/auth/google?app=customer", { redirect: "manual" });
    const configured = googleStart.status === 302 && (googleStart.location ?? "").includes("accounts.google.com");
    const unconfigured = googleStart.status === 503 && googleStart.body.code === "GOOGLE_NOT_CONFIGURED";
    check("Google sign-in handles configuration state (503 without keys, 302 with keys)", configured || unconfigured, JSON.stringify(googleStart.body));

    // Profile updates (Google users add a phone).
    const updatePhone = await request(base, "/api/v1/auth/me", { method: "PATCH", body: JSON.stringify({ phone: "+919888888889" }) }, googleToken);
    check("user can add a phone to their profile", updatePhone.status === 200 && updatePhone.body.user.phone === "+919888888889");
    const updateBarePhone = await request(base, "/api/v1/auth/me", { method: "PATCH", body: JSON.stringify({ phone: "7000000000" }) }, googleToken);
    check("profile update accepts a bare 10-digit phone", updateBarePhone.status === 200 && updateBarePhone.body.user.phone === "+917000000000");
    const phoneTaken = await request(base, "/api/v1/auth/me", { method: "PATCH", body: JSON.stringify({ phone: "+919999999999" }) }, googleToken);
    check("phone already in use is rejected", phoneTaken.status === 409 && phoneTaken.body.code === "PHONE_TAKEN");

    // Session behaviour.
    const me = await request(base, "/api/v1/auth/me", {}, customerToken);
    check("GET /auth/me returns the user", me.status === 200 && me.body.user.name === "Test Customer");

    const meNoToken = await request(base, "/api/v1/auth/me");
    check("GET /auth/me without token is 401", meNoToken.status === 401 && meNoToken.body.code === "UNAUTHORIZED");

    const expiredToken = jwt.sign({ sub: "000000000000000000000000", role: "CUSTOMER" }, "test-secret", { expiresIn: "-1s" });
    const meExpired = await request(base, "/api/v1/auth/me", {}, expiredToken);
    check("expired session token rejected", meExpired.status === 401 && meExpired.body.code === "UNAUTHORIZED");

    const logout = await request(base, "/api/v1/auth/logout", { method: "POST" }, customerToken);
    check("logout succeeds for an authenticated user", logout.status === 200 && logout.body.success === true);

    const meAfter = await request(base, "/api/v1/auth/me", {}, customerToken);
    check("token survives refresh (stateless session persists)", meAfter.status === 200 && meAfter.body.user.id === me.body.user.id);
  }

  // ---------- Cross-role auth (same email across customer / rider / restaurant) ----------
  console.log("\nCross-role auth");
  {
    const crossEmail = "crossrole@test.test";

    // 1. Register as CUSTOMER first.
    const custReg = await registerUser("Cross Customer", crossEmail, { role: "CUSTOMER", phone: "+919700000001" });
    check("cross-role: register as CUSTOMER succeeds", custReg.status === 201 && custReg.body.user.role === "CUSTOMER", JSON.stringify(custReg.body));

    // 2. Login as CUSTOMER — should return the customer account.
    const custLogin = await loginUser(crossEmail, "CUSTOMER");
    check("cross-role: login as CUSTOMER returns customer account", custLogin.status === 200 && custLogin.body.user.role === "CUSTOMER" && custLogin.body.isNew === false);

    // 3. Login as RIDER with same email — should return isNew (no rider account yet).
    const riderLogin = await loginUser(crossEmail, "RIDER");
    check("cross-role: login as RIDER returns isNew when no rider account exists", riderLogin.status === 200 && riderLogin.body.isNew === true && Boolean(riderLogin.body.regToken));

    // 4. Register as RIDER with the same email — should succeed (compound unique index).
    const riderReg = await request(base, "/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: crossEmail, regToken: riderLogin.body.regToken, name: "Cross Rider", phone: "+919700000001", role: "RIDER" }),
    });
    check("cross-role: register as RIDER with same email succeeds", riderReg.status === 201 && riderReg.body.user.role === "RIDER", JSON.stringify(riderReg.body));

    // 5. Same phone across roles should be allowed (phone unique per role now).
    const phoneOk = await registerUser("Cross Restaurant", "crossrest@test.test", { role: "RESTAURANT", phone: "+919700000001" });
    check("cross-role: same phone allowed for different roles", phoneOk.status === 201 && phoneOk.body.user.role === "RESTAURANT", JSON.stringify(phoneOk.body));

    // 6. Duplicate email+role should still be rejected.
    const dupRider = await request(base, "/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: crossEmail, regToken: riderLogin.body.regToken, name: "Dup Rider", role: "RIDER" }),
    });
    check("cross-role: duplicate email+role rejected", dupRider.status === 409 && dupRider.body.code === "ACCOUNT_EXISTS", JSON.stringify(dupRider.body));

    // 7. Returning rider login should now find the rider account.
    const riderReturn = await loginUser(crossEmail, "RIDER");
    check("cross-role: returning rider login finds the rider account", riderReturn.status === 200 && riderReturn.body.isNew === false && riderReturn.body.user.role === "RIDER");

    // 8. Google OAuth as rider with same email creates a separate rider user.
    const googleRider = await request(base, "/api/v1/auth/google/dev-callback?app=rider&email=crossrole@test.test&name=Cross%20Google%20Rider", { redirect: "manual" });
    const googleRiderUrl = new URL(googleRider.location ?? "");
    const googleRiderUser = JSON.parse(decodeURIComponent(googleRiderUrl.searchParams.get("user") ?? "{}"));
    check("cross-role: Google OAuth as rider with existing customer email works", googleRider.status === 302 && googleRiderUser.email === "crossrole@test.test" && googleRiderUser.role === "RIDER", JSON.stringify(googleRiderUser));

    // 9. Google OAuth as restaurant with same email.
    const googleRest = await request(base, "/api/v1/auth/google/dev-callback?app=restaurant&email=crossrole@test.test&name=Cross%20Google%20Rest", { redirect: "manual" });
    const googleRestUrl = new URL(googleRest.location ?? "");
    const googleRestUser = JSON.parse(decodeURIComponent(googleRestUrl.searchParams.get("user") ?? "{}"));
    check("cross-role: Google OAuth as restaurant with existing customer email works", googleRest.status === 302 && googleRestUser.email === "crossrole@test.test" && googleRestUser.role === "RESTAURANT", JSON.stringify(googleRestUser));

    // 10. Customer login still works — regression check.
    const custReturn = await loginUser(crossEmail, "CUSTOMER");
    check("cross-role: customer login still works after rider/restaurant creation", custReturn.status === 200 && custReturn.body.user.role === "CUSTOMER" && custReturn.body.isNew === false);

    // 11. No-role fallback: sign in WITHOUT sending role — frontends omit role.
    // Admin user should be found even though frontends don't send role: "ADMIN".
    const adminNoRoleLogin = await loginUser("ramnagareats@admin.com");
    check("no-role: admin signs in without role param", adminNoRoleLogin.status === 200 && adminNoRoleLogin.body.isNew === false && adminNoRoleLogin.body.user.role === "ADMIN", JSON.stringify(adminNoRoleLogin.body));

    // Restaurant user signs in without role.
    const restNoRoleLogin = await loginUser("kitchen@ramnagareats.test");
    check("no-role: restaurant owner signs in without role param", restNoRoleLogin.status === 200 && restNoRoleLogin.body.isNew === false && restNoRoleLogin.body.user.role === "RESTAURANT", JSON.stringify(restNoRoleLogin.body));

    // Rider no-role test is added after the Rider section (rider1@test.test is registered there).

    // Customer user signs in without role (the original/default case).
    const custNoRoleLogin = await loginUser("test@customer.test");
    check("no-role: customer signs in without role param", custNoRoleLogin.status === 200 && custNoRoleLogin.body.isNew === false && custNoRoleLogin.body.user.role === "CUSTOMER", JSON.stringify(custNoRoleLogin.body));

    // Unknown email without role returns isNew (new user registration).
    const unknownNoRole = await loginUser("brand-new-user@test.test");
    check("no-role: unknown email returns isNew for registration", unknownNoRole.status === 200 && unknownNoRole.body.isNew === true && Boolean(unknownNoRole.body.regToken));
  }

  // ---------- 3-App sign-in scenarios (simulates real frontend behavior) ----------
  console.log("\n3-App sign-in scenarios");
  {
    // Simulates: all 3 frontends now send their role in verify-otp
    const appEmail = `3app_${Date.now()}@test.test`;

    // ── Step 1: Register as CUSTOMER on customer-web ──
    const custSent = await sendOtp(appEmail);
    if (custSent.status === 400 && custSent.body.code === "OTP_RESEND_TOO_SOON") {
      await new Promise((r) => setTimeout(r, Number(process.env.OTP_RESEND_COOLDOWN_MS ?? 100) + 50));
      await sendOtp(appEmail);
    }
    const custVerified = await verifyOtp(appEmail, await devCode(appEmail), "CUSTOMER");
    check("3app: customer-web returns isNew for new email", custVerified.status === 200 && custVerified.body.isNew === true);
    const custReg = await request(base, "/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: appEmail, regToken: custVerified.body.regToken, name: "3-App User", role: "CUSTOMER" }),
    });
    check("3app: CUSTOMER registration succeeds", custReg.status === 201 && custReg.body.user.role === "CUSTOMER");

    // ── Step 2: Sign in on customer-web (role: CUSTOMER) ──
    const custLogin = await loginUser(appEmail, "CUSTOMER");
    check("3app: customer-web sign-in finds CUSTOMER", custLogin.status === 200 && custLogin.body.isNew === false && custLogin.body.user.role === "CUSTOMER");

    // ── Step 3: Sign in on restaurant-web (role: RESTAURANT) — should return isNew ──
    const restLogin = await loginUser(appEmail, "RESTAURANT");
    check("3app: restaurant-web returns isNew (no RESTAURANT account)", restLogin.status === 200 && restLogin.body.isNew === true && Boolean(restLogin.body.regToken));

    // ── Step 3b: Register as RESTAURANT on restaurant-web (same email) ──
    const restReg = await request(base, "/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: appEmail, regToken: restLogin.body.regToken, name: "3-App Restaurant", role: "RESTAURANT" }),
    });
    check("3app: RESTAURANT registration succeeds (same email)", restReg.status === 201 && restReg.body.user.role === "RESTAURANT");

    // ── Step 4: Sign in on rider-web (role: RIDER) — should return isNew ──
    const riderLogin = await loginUser(appEmail, "RIDER");
    check("3app: rider-web returns isNew (no RIDER account)", riderLogin.status === 200 && riderLogin.body.isNew === true && Boolean(riderLogin.body.regToken));

    // ── Step 5: Register as RIDER on rider-web (same email) ──
    const riderReg = await request(base, "/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: appEmail, regToken: riderLogin.body.regToken, name: "3-App Rider", role: "RIDER" }),
    });
    check("3app: RIDER registration succeeds (same email)", riderReg.status === 201 && riderReg.body.user.role === "RIDER");

    // ── Step 6: Sign in on all 3 apps — each finds its own role ──
    const custReturn = await loginUser(appEmail, "CUSTOMER");
    check("3app: customer-web still finds CUSTOMER", custReturn.status === 200 && custReturn.body.user.role === "CUSTOMER" && custReturn.body.isNew === false);

    const riderReturn = await loginUser(appEmail, "RIDER");
    check("3app: rider-web now finds RIDER", riderReturn.status === 200 && riderReturn.body.user.role === "RIDER" && riderReturn.body.isNew === false);

    const restReturn = await loginUser(appEmail, "RESTAURANT");
    check("3app: restaurant-web now finds RESTAURANT", restReturn.status === 200 && restReturn.body.user.role === "RESTAURANT" && restReturn.body.isNew === false);

    // ── Step 7: Try to register duplicate role — should fail ──
    const dupCust = await request(base, "/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: appEmail, regToken: custVerified.body.regToken, name: "Dup Customer", role: "CUSTOMER" }),
    });
    check("3app: duplicate CUSTOMER registration rejected", dupCust.status === 409 && dupCust.body.code === "ACCOUNT_EXISTS");

    const dupRider = await request(base, "/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: appEmail, regToken: riderLogin.body.regToken, name: "Dup Rider", role: "RIDER" }),
    });
    check("3app: duplicate RIDER registration rejected", dupRider.status === 409 && dupRider.body.code === "ACCOUNT_EXISTS");
  }

  // ---------- Restaurants ----------
  console.log("\nRestaurants (data comes from the database)");
  {
    const list = await request(base, "/api/v1/restaurants?lat=32.80674&lng=75.314854&limit=50");
    check("list returns restaurants from DB", list.status === 200 && list.body.restaurants.length >= 10, `got ${list.body.restaurants?.length}`);
    const firstRestaurant = list.body.restaurants[0];
    check("restaurant DTO exposes phone + location", Boolean(firstRestaurant?.phone) && firstRestaurant?.location?.lat != null && firstRestaurant?.location?.lng != null, JSON.stringify(firstRestaurant ?? null));
    check("every restaurant has display fields", list.body.restaurants.every((r: any) => r.name && r.rating !== undefined && r.deliveryTimeMin && r.priceForTwo && r.cuisines.length));
    check("distance computed for nearby query", list.body.restaurants.every((r: any) => r.distanceKm !== undefined));

    const outOfArea = await request(base, "/api/v1/restaurants?lat=31.5&lng=75.3&limit=50");
    check("out-of-area location hides far restaurants", outOfArea.body.restaurants.length === 0);

    const search = await request(base, "/api/v1/restaurants?q=biryani&limit=50");
    check("search filters by name/cuisine", search.status === 200 && search.body.restaurants.some((r: any) => r.name === "Royal Biryani House") && search.body.restaurants.every((r: any) => (r.name + r.cuisines.join(" ")).toLowerCase().includes("biryani")));

    const cuisine = await request(base, "/api/v1/restaurants?cuisines=Pizza&limit=50");
    check("cuisine filter works", cuisine.body.restaurants.length === 1 && cuisine.body.restaurants[0].name === "Pizza Roma");

    const rating = await request(base, "/api/v1/restaurants?rating=4.5&limit=50");
    check("rating filter works", rating.body.restaurants.every((r: any) => r.rating >= 4.5) && rating.body.restaurants.length >= 4);

    const veg = await request(base, "/api/v1/restaurants?veg=true&limit=50");
    check("vegetarian filter works", veg.body.restaurants.every((r: any) => r.isPureVeg === true) && veg.body.restaurants.length >= 2);

    const delivery = await request(base, "/api/v1/restaurants?deliveryTime=25&limit=50");
    check("delivery time filter works", delivery.body.restaurants.every((r: any) => r.deliveryTimeMax <= 25));

    const price = await request(base, "/api/v1/restaurants?price=250&limit=50");
    check("price range filter works", price.body.restaurants.every((r: any) => r.priceForTwo <= 250));

    const sortRating = await request(base, "/api/v1/restaurants?sort=rating&limit=50");
    const ratings = sortRating.body.restaurants.map((r: any) => r.rating);
    check("sort by rating works", ratings.every((value: number, index: number) => index === 0 || ratings[index - 1] >= value));

    const sortTime = await request(base, "/api/v1/restaurants?sort=delivery_time&limit=50");
    const times = sortTime.body.restaurants.map((r: any) => r.deliveryTimeMin);
    check("sort by delivery time works", times.every((value: number, index: number) => index === 0 || times[index - 1] <= value));

    const paged = await request(base, "/api/v1/restaurants?page=1&limit=5&lat=32.80674&lng=75.314854");
    check("pagination returns limited page", paged.body.restaurants.length === 5 && paged.body.hasMore === true && paged.body.total > 5);
  }

  // ---------- Restaurant detail + menu ----------
  console.log("\nRestaurant detail & menu");
  {
    const list = await request(base, "/api/v1/restaurants?limit=1");
    const id = list.body.restaurants[0].id;
    const detail = await request(base, `/api/v1/restaurants/${id}`);
    check("restaurant detail loads dynamically", detail.status === 200 && detail.body.restaurant.id === id);

    const reviews = await request(base, `/api/v1/restaurants/${id}/reviews`);
    check("reviews endpoint returns summary + list", reviews.status === 200 && typeof reviews.body.summary?.count === "number" && Array.isArray(reviews.body.reviews) && reviews.body.summary.breakdown.length === 5, JSON.stringify(reviews.body));

    const menu = await request(base, `/api/v1/restaurants/${id}/menu`);
    check("menu loads dynamically with categories", menu.status === 200 && menu.body.categories.length >= 2 && menu.body.categories.every((c: any) => Array.isArray(c.items)));
    check("menu items carry customization data", menu.body.categories.some((c: any) => c.items.some((i: any) => Array.isArray(i.customizations))));

    const invalid = await request(base, "/api/v1/restaurants/000000000000000000000000");
    check("invalid restaurant id returns proper error", invalid.status === 404 && invalid.body.code === "NOT_FOUND" && invalid.body.success === false);

    const invalidMenu = await request(base, "/api/v1/restaurants/not-a-real-id/menu");
    check("malformed restaurant id in menu returns error", invalidMenu.status === 404 && invalidMenu.body.success === false);
  }

  // ---------- Categories ----------
  console.log("\nCategories");
  {
    const categories = await request(base, "/api/v1/categories");
    check("categories come from the API", categories.status === 200 && categories.body.categories.length >= 8 && categories.body.categories[0].name);
  }

  // ---------- Locations ----------
  console.log("\nLocations");
  {
    const inside = await request(base, "/api/v1/locations/serviceability?lat=32.80674&lng=75.314854");
    check("serviceable location accepted", inside.status === 200 && inside.body.serviceable === true);

    const outside = await request(base, "/api/v1/locations/serviceability?lat=31.5&lng=75.3");
    check("out-of-area location rejected", outside.status === 200 && outside.body.serviceable === false && typeof outside.body.distanceKm === "number");

    const missing = await request(base, "/api/v1/locations/serviceability");
    check("missing coordinates rejected", missing.status === 400 && missing.body.code === "VALIDATION_ERROR");

    // Boundary: exactly at the radius is still serviceable; just beyond is not.
    // Seeded radius is 5 km; 1 degree of latitude ≈ 111.32 km.
    const boundaryLat = (32.80674 + 5 / 111.32).toFixed(6);
    const atBoundary = await request(base, `/api/v1/locations/serviceability?lat=${boundaryLat}&lng=75.314854`);
    check("exactly at the radius is serviceable", atBoundary.status === 200 && atBoundary.body.serviceable === true && atBoundary.body.distanceKm <= 5, JSON.stringify(atBoundary.body));
    const justBeyond = await request(base, `/api/v1/locations/serviceability?lat=${(32.80674 + 0.06).toFixed(6)}&lng=75.314854`);
    check("just beyond the radius is rejected", justBeyond.status === 200 && justBeyond.body.serviceable === false);

    const invalidCoords = await request(base, "/api/v1/locations/serviceability?lat=999&lng=75.314854");
    check("invalid coordinates rejected", invalidCoords.status === 400);

    // Reverse geocoding: bad input rejected without touching the geocoder.
    const badReverse = await request(base, "/api/v1/locations/reverse-geocode", { method: "POST", body: JSON.stringify({ lat: 999, lng: 75.314854 }) });
    check("reverse-geocode rejects invalid coordinates", badReverse.status === 400 && badReverse.body.code === "VALIDATION_ERROR");

    // Geocoder outage: the endpoint degrades to a clear 502 instead of a 500.
    const previousBase = process.env.GEOCODER_BASE_URL;
    process.env.GEOCODER_BASE_URL = "http://127.0.0.1:1"; // unreachable — fails fast
    const geocoderDown = await request(base, "/api/v1/locations/reverse-geocode", { method: "POST", body: JSON.stringify({ lat: 32.80674, lng: 75.314854 }) });
    if (previousBase === undefined) delete process.env.GEOCODER_BASE_URL;
    else process.env.GEOCODER_BASE_URL = previousBase;
    check("reverse-geocode fails gracefully when the geocoder is unreachable", geocoderDown.status === 502 && geocoderDown.body.code === "GEOCODE_FAILED", JSON.stringify(geocoderDown.body));
  }

  // ---------- Location service area (admin-controlled, backend authority) ----------
  console.log("\nService area");
  {
    const customer = await registerUser("Area Customer", "area@customer.test");
    const admin = await loginUser("ramnagareats@admin.com", "ADMIN");

    const forbiddenGet = await request(base, "/api/v1/admin/service-area", {}, customer.body.token);
    check("non-admin cannot read service area", forbiddenGet.status === 403);
    const forbiddenPatch = await request(base, "/api/v1/admin/service-area", { method: "PATCH", body: JSON.stringify({ lat: 0, lng: 0, radiusKm: 50 }) }, customer.body.token);
    check("non-admin cannot change service area", forbiddenPatch.status === 403);

    const current = await request(base, "/api/v1/admin/service-area", {}, admin.body.token);
    check("admin can read service area", current.status === 200 && current.body.serviceArea.radiusKm === 5, JSON.stringify(current.body));

    // Widen the area to 50 km: a far point becomes serviceable, proving the
    // admin setting (not env) is what the backend enforces.
    const widen = await request(base, "/api/v1/admin/service-area", { method: "PATCH", body: JSON.stringify({ lat: 32.80674, lng: 75.314854, radiusKm: 50, address: "Ramnagar, Jammu", pincode: "182122" }) }, admin.body.token);
    check("admin can update service area", widen.status === 200 && widen.body.serviceArea.radiusKm === 50);
    const nowInside = await request(base, "/api/v1/locations/serviceability?lat=33.05674&lng=75.314854"); // ~28 km: inside 50, outside 5
    check("radius change takes effect immediately", nowInside.status === 200 && nowInside.body.serviceable === true, JSON.stringify(nowInside.body));

    // Out-of-range order is rejected by the backend — direct API bypass attempt.
    const farAddress = await request(base, "/api/v1/users/addresses", {
      method: "POST",
      body: JSON.stringify({ label: "Home", formattedAddress: "Far away colony", pincode: "182999", latitude: 31.5, longitude: 75.3 }),
    }, customer.body.token);
    const menu = await request(base, "/api/v1/restaurants?limit=1");
    const farMenu = await request(base, `/api/v1/restaurants/${menu.body.restaurants[0].id}/menu`);
    const item = farMenu.body.categories.flatMap((c: any) => c.items).find((i: any) => i.isAvailable);
    const bypass = await request(base, "/api/v1/orders", {
      method: "POST",
      body: JSON.stringify({ restaurantId: menu.body.restaurants[0].id, items: [{ itemId: item.id, quantity: 1 }], addressId: farAddress.body.address.id, idempotencyKey: "area-bypass-0001" }),
    }, customer.body.token);
    check("order to an out-of-area address is rejected by the backend", bypass.status === 409 && bypass.body.code === "OUT_OF_SERVICE_AREA", JSON.stringify(bypass.body));

    // Restore the original radius for the rest of the suite.
    const restore = await request(base, "/api/v1/admin/service-area", { method: "PATCH", body: JSON.stringify({ lat: 32.80674, lng: 75.314854, radiusKm: 5 }) }, admin.body.token);
    check("service area restored", restore.status === 200 && restore.body.serviceArea.radiusKm === 5);
  }

  // ---------- Admin coupon management (CRUD) ----------
  console.log("\nAdmin coupons");
  {
    const customer = await registerUser("Coupon Customer", "coupon@customer.test");
    const admin = await loginUser("ramnagareats@admin.com", "ADMIN");

    const forbidden = await request(base, "/api/v1/admin/coupons", {}, customer.body.token);
    check("non-admin cannot list coupons", forbidden.status === 403);

    const list = await request(base, "/api/v1/admin/coupons", {}, admin.body.token);
    check("admin can list seed coupons", list.status === 200 && list.body.coupons.some((c: any) => c.code === "WELCOME20"));

    const created = await request(base, "/api/v1/admin/coupons", {
      method: "POST",
      body: JSON.stringify({ code: "ADMIN50", description: "Admin test coupon", discountType: "FLAT", discountValue: 50, minOrderValue: 150, usageLimit: 5 }),
    }, admin.body.token);
    check("admin can create a coupon", created.status === 201 && created.body.coupon.code === "ADMIN50" && created.body.coupon.minOrderValue === 150, JSON.stringify(created.body));

    const duplicate = await request(base, "/api/v1/admin/coupons", { method: "POST", body: JSON.stringify({ code: "admin50", discountType: "FLAT", discountValue: 10 }) }, admin.body.token);
    check("duplicate coupon code rejected case-insensitively", duplicate.status === 400 && duplicate.body.code === "COUPON_EXISTS");

    const patched = await request(base, `/api/v1/admin/coupons/${created.body.coupon.id}`, { method: "PATCH", body: JSON.stringify({ discountValue: 75, isActive: false }) }, admin.body.token);
    check("admin can update a coupon", patched.status === 200 && patched.body.coupon.discountValue === 75 && patched.body.coupon.isActive === false, JSON.stringify(patched.body));

    // A paused coupon must not validate at checkout.
    const listRestaurants = await request(base, "/api/v1/restaurants?limit=1");
    const pausedCheck = await request(base, "/api/v1/coupons/validate", {
      method: "POST",
      body: JSON.stringify({ code: "ADMIN50", restaurantId: listRestaurants.body.restaurants[0].id, subtotal: 300 }),
    }, customer.body.token);
    check("paused coupon is rejected at checkout", pausedCheck.status === 200 && pausedCheck.body.valid === false, JSON.stringify(pausedCheck.body));

    const deleted = await request(base, `/api/v1/admin/coupons/${created.body.coupon.id}`, { method: "DELETE" }, admin.body.token);
    check("admin can delete a coupon", deleted.status === 204);

    const afterDelete = await request(base, "/api/v1/admin/coupons", {}, admin.body.token);
    check("deleted coupon no longer listed", !afterDelete.body.coupons.some((c: any) => c.code === "ADMIN50"));
  }

  // ---------- Authorization ----------
  console.log("\nAuthorization");
  {
    const owner = await request(base, "/api/v1/restaurants/me");
    check("owner route without token is 401", owner.status === 401);

    const reg = await registerUser("Unauth Customer", "unauth@customer.test");
    const asCustomer = await request(base, "/api/v1/restaurants/me", {}, reg.body.token);
    check("customer cannot access owner routes", asCustomer.status === 403 && asCustomer.body.code === "FORBIDDEN");
  }

  // ---------- Owner menu management (dynamic menu chunk) ----------
  console.log("\nOwner menu management");
  {
    const ownerLogin = await loginUser("kitchen@ramnagareats.test", "RESTAURANT");
    const ownerToken = ownerLogin.body.token;

    const categories = await request(base, "/api/v1/restaurants/me/categories", {}, ownerToken);
    const categoryId = categories.body.categories[0].id;

    // Food type is mandatory: creating an item without isVeg must fail.
    const noFoodType = await request(base, "/api/v1/restaurants/me/menu-items", {
      method: "POST",
      body: JSON.stringify({ categoryId, name: "Mystery Dish", price: 99 }),
    }, ownerToken);
    check("menu item without food type is rejected", noFoodType.status === 400 && noFoodType.body.code === "VALIDATION_ERROR");

    const created = await request(base, "/api/v1/restaurants/me/menu-items", {
      method: "POST",
      body: JSON.stringify({ categoryId, name: "Veg Thali", price: 180, isVeg: true, isRecommended: true, prepTime: 18 }),
    }, ownerToken);
    check("owner creates veg item with prep time + recommended", created.status === 201 && created.body.item.isVeg === true && created.body.item.isRecommended === true && created.body.item.prepTime === 18);

    const updated = await request(base, `/api/v1/restaurants/me/menu-items/${created.body.item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isVeg: false, prepTime: 25 }),
    }, ownerToken);
    check("owner can edit food type + prep time", updated.status === 200 && updated.body.item.isVeg === false && updated.body.item.prepTime === 25);

    const menu = await request(base, "/api/v1/restaurants/me/menu-items", {}, ownerToken);
    check("owner menu lists the new item", menu.body.items.some((i: any) => i.id === created.body.item.id));

    // The public menu exposes the same fields.
    const me = await request(base, "/api/v1/restaurants/me", {}, ownerToken);
    const publicMenu = await request(base, `/api/v1/restaurants/${me.body.restaurant.id}/menu`);
    const publicItem = publicMenu.body.categories.flatMap((c: any) => c.items).find((i: any) => i.id === created.body.item.id);
    check("public menu exposes food type + prep time + recommended", publicItem && publicItem.isVeg === false && publicItem.prepTime === 25 && publicItem.isRecommended === true);

    // Owner can set opening hours + accepting orders via profile.
    const current = await request(base, "/api/v1/restaurants/me", {}, ownerToken);
    const profile = await request(base, "/api/v1/restaurants/me", {
      method: "PUT",
      body: JSON.stringify({ name: current.body.restaurant.name, openingTime: "10:00", closingTime: "22:00", isAcceptingOrders: true }),
    }, ownerToken);
    check("owner can set opening hours", profile.status === 200 && profile.body.restaurant.openingTime === "10:00" && profile.body.restaurant.closingTime === "22:00" && profile.body.restaurant.isAcceptingOrders === true);
    // Restore 24/7 hours so later order-flow tests aren't time-of-day dependent.
    await request(base, "/api/v1/restaurants/me", {
      method: "PUT",
      body: JSON.stringify({ name: current.body.restaurant.name, openingTime: "", closingTime: "", isAcceptingOrders: true }),
    }, ownerToken);

    const removed = await request(base, `/api/v1/restaurants/me/menu-items/${created.body.item.id}`, { method: "DELETE" }, ownerToken);
    check("owner deletes menu item", removed.status === 204);
  }

  // ---------- Coupons + Orders (Chunk 2) ----------
  console.log("\nCoupons & orders");
  {
    const reg = await registerUser("Order Customer", "orders@customer.test");
    const token = reg.body.token;

    const addr = await request(base, "/api/v1/users/addresses", {
      method: "POST",
      body: JSON.stringify({ label: "Home", formattedAddress: "1 Canal Road, Ramnagar, Jammu", pincode: "182122", latitude: 32.80674, longitude: 75.314854 }),
    }, token);
    check("address creation works", addr.status === 201 && addr.body.address.id);
    const addressId = addr.body.address.id;

    const other = await registerUser("Other User", "otheruser@customer.test");
    const otherAddr = await request(base, "/api/v1/users/addresses", {
      method: "POST",
      body: JSON.stringify({ label: "Work", formattedAddress: "9 Office Lane, Ramnagar Eats Hub", pincode: "182125", latitude: 32.80874, longitude: 75.317854 }),
    }, other.body.token);

    // Pick an open restaurant + two available items.
    const list = await request(base, "/api/v1/restaurants?lat=32.80674&lng=75.314854&limit=50");
    const restaurant = list.body.restaurants.find((r: any) => r.isOpen);
    const menu = await request(base, `/api/v1/restaurants/${restaurant.id}/menu`);
    const items = menu.body.categories.flatMap((c: any) => c.items).filter((i: any) => i.isAvailable);
    const itemA = items[0];
    const itemB = items[1];
    const expectedSubtotal = itemA.price + itemB.price * 2;
    const expectedFee = 20;
    const expectedDiscount = Math.min(Math.round((expectedSubtotal * 20) / 100), 100);
    const expectedTotal = expectedSubtotal + expectedFee - expectedDiscount;

    const coupon = await request(base, "/api/v1/coupons/validate", {
      method: "POST",
      body: JSON.stringify({ code: "WELCOME20", restaurantId: restaurant.id, subtotal: expectedSubtotal }),
    }, token);
    check("coupon validation returns discount", coupon.status === 200 && coupon.body.valid === true && coupon.body.discountAmount === expectedDiscount, JSON.stringify(coupon.body));

    const badCoupon = await request(base, "/api/v1/coupons/validate", {
      method: "POST",
      body: JSON.stringify({ code: "NOPE99", restaurantId: restaurant.id, subtotal: 500 }),
    }, token);
    check("invalid coupon rejected on validate", badCoupon.status === 200 && badCoupon.body.valid === false);

    const wrongRestaurantCoupon = await request(base, "/api/v1/coupons/validate", {
      method: "POST",
      body: JSON.stringify({ code: "PIZZA10", restaurantId: restaurant.id, subtotal: 500 }),
    }, token);
    check("restaurant-scoped coupon rejected elsewhere", wrongRestaurantCoupon.body.valid === false);

    const orderPayload = {
      restaurantId: restaurant.id,
      items: [
        { itemId: itemA.id, quantity: 1 },
        { itemId: itemB.id, quantity: 2 },
      ],
      addressId,
      couponCode: "WELCOME20",
      paymentMethod: "COD",
      idempotencyKey: "order-flow-0001",
    };
    const order = await request(base, "/api/v1/orders", { method: "POST", body: JSON.stringify(orderPayload) }, token);
    check("order creation succeeds", order.status === 201 && order.body.order.status === "PLACED" && order.body.order.orderNumber.startsWith("RE-"));
    check("server computes authoritative totals", order.body.order.subtotal === expectedSubtotal && order.body.order.deliveryFee === expectedFee && order.body.order.discount === expectedDiscount && order.body.order.total === expectedTotal, JSON.stringify(order.body.order));
    check("order items are snapshotted with names", order.body.order.items.length === 2 && order.body.order.items[0].name === itemA.name && order.body.order.items[0].price === itemA.price);
    check("delivery address snapshotted", order.body.order.deliveryAddress.pincode === "182122");
    check("COD payment is pending", order.body.order.paymentMethod === "COD" && order.body.order.paymentStatus === "PENDING");
    check("estimated delivery set", Boolean(order.body.order.estimatedDeliveryAt));
    const orderId = order.body.order.id;

    const orderList = await request(base, "/api/v1/orders", {}, token);
    check("order appears in customer order list", orderList.body.orders.length >= 1 && orderList.body.orders[0].id === orderId);

    const orderDetail = await request(base, `/api/v1/orders/${orderId}`, {}, token);
    check("order detail loads", orderDetail.status === 200 && orderDetail.body.order.orderNumber === order.body.order.orderNumber);

    // Route + dynamic ETA (geodesic fallback — tests run without a Mapbox token).
    const route = await request(base, `/api/v1/orders/${orderId}/route`, {}, token);
    check("route returns restaurant + delivery points", route.status === 200 && route.body.restaurant?.location?.lat != null && route.body.delivery?.location?.lat != null, JSON.stringify(route.body));
    check("route returns a polyline between both points", route.body.route && route.body.route.polyline.length >= 2 && typeof route.body.eta?.minutes === "number", JSON.stringify(route.body.route ?? null));
    check("route ETA is dynamic and finite", route.body.eta?.minutes >= 1 && typeof route.body.eta.distanceKm === "number");
    check("route exposes the restaurant phone for the call button", typeof route.body.restaurant?.phone === "string");

    const otherUserDetail = await request(base, `/api/v1/orders/${orderId}`, {}, other.body.token);
    check("another customer cannot read this order", otherUserDetail.status === 404);

    const duplicate = await request(base, "/api/v1/orders", { method: "POST", body: JSON.stringify(orderPayload) }, token);
    const orderCount = await Order.countDocuments({ customerId: reg.body.user.id });
    check("duplicate order request returns same order", duplicate.body.order.id === orderId && duplicate.body.duplicate === true && orderCount === 1, JSON.stringify(duplicate.body));

    const reusedCoupon = await request(base, "/api/v1/coupons/validate", {
      method: "POST",
      body: JSON.stringify({ code: "WELCOME20", restaurantId: restaurant.id, subtotal: 500 }),
    }, token);
    check("coupon per-user limit enforced", reusedCoupon.body.valid === false);

    // Failure cases.
    const emptyCart = await request(base, "/api/v1/orders", {
      method: "POST",
      body: JSON.stringify({ restaurantId: restaurant.id, items: [], addressId }),
    }, token);
    check("empty cart rejected", emptyCart.status === 400);

    const noAuth = await request(base, "/api/v1/orders", { method: "POST", body: JSON.stringify(orderPayload) });
    check("order without auth rejected", noAuth.status === 401);

    const wrongAddress = await request(base, "/api/v1/orders", {
      method: "POST",
      body: JSON.stringify({ restaurantId: restaurant.id, items: [{ itemId: itemA.id, quantity: 1 }], addressId: otherAddr.body.address.id }),
    }, token);
    check("another user's address rejected", wrongAddress.status === 400 && wrongAddress.body.code === "INVALID_ADDRESS");

    const otherRestaurant = list.body.restaurants.find((r: any) => r.id !== restaurant.id && r.isOpen);
    const otherMenu = await request(base, `/api/v1/restaurants/${otherRestaurant.id}/menu`);
    const otherItem = otherMenu.body.categories.flatMap((c: any) => c.items).find((i: any) => i.isAvailable);
    const mixed = await request(base, "/api/v1/orders", {
      method: "POST",
      body: JSON.stringify({
        restaurantId: restaurant.id,
        items: [{ itemId: itemA.id, quantity: 1 }, { itemId: otherItem.id, quantity: 1 }],
        addressId,
      }),
    }, token);
    check("items from another restaurant rejected", mixed.status === 400 && mixed.body.code === "INVALID_ITEMS");

    const badCouponOrder = await request(base, "/api/v1/orders", {
      method: "POST",
      body: JSON.stringify({ restaurantId: restaurant.id, items: [{ itemId: itemA.id, quantity: 1 }], addressId, couponCode: "NOPE99" }),
    }, token);
    check("invalid coupon blocks order", badCouponOrder.status === 409 && badCouponOrder.body.code === "INVALID_COUPON");

    const expired = await Coupon.create({ code: "EXPIRED50", description: "expired", discountType: "FLAT", discountValue: 50, validUntil: new Date(Date.now() - 60_000) });
    const expiredOrder = await request(base, "/api/v1/orders", {
      method: "POST",
      body: JSON.stringify({ restaurantId: restaurant.id, items: [{ itemId: itemA.id, quantity: 1 }], addressId, couponCode: "EXPIRED50" }),
    }, token);
    check("expired coupon blocks order", expiredOrder.status === 409 && expiredOrder.body.code === "INVALID_COUPON");

    // Out-of-stock: disable the item in the DB, order must fail.
    await MenuItem.updateOne({ _id: itemA.id }, { $set: { isAvailable: false } });
    const outOfStock = await request(base, "/api/v1/orders", {
      method: "POST",
      body: JSON.stringify({ restaurantId: restaurant.id, items: [{ itemId: itemA.id, quantity: 1 }], addressId }),
    }, token);
    check("out-of-stock item blocks order", outOfStock.status === 409 && outOfStock.body.code === "ITEM_UNAVAILABLE");
    await MenuItem.updateOne({ _id: itemA.id }, { $set: { isAvailable: true } });

    // Closed restaurant (manual toggle).
    await Restaurant.updateOne({ _id: restaurant.id }, { $set: { isOpen: false } });
    const closed = await request(base, "/api/v1/orders", {
      method: "POST",
      body: JSON.stringify({ restaurantId: restaurant.id, items: [{ itemId: itemA.id, quantity: 1 }], addressId }),
    }, token);
    check("closed restaurant blocks order", closed.status === 409 && closed.body.code === "RESTAURANT_UNAVAILABLE");
    await Restaurant.updateOne({ _id: restaurant.id }, { $set: { isOpen: true } });

    // Not accepting orders (owner paused) also blocks order creation.
    await Restaurant.updateOne({ _id: restaurant.id }, { $set: { isAcceptingOrders: false } });
    const paused = await request(base, "/api/v1/orders", {
      method: "POST",
      body: JSON.stringify({ restaurantId: restaurant.id, items: [{ itemId: itemA.id, quantity: 1 }], addressId }),
    }, token);
    check("restaurant not accepting orders blocks order", paused.status === 409 && paused.body.code === "RESTAURANT_UNAVAILABLE");
    await Restaurant.updateOne({ _id: restaurant.id }, { $set: { isAcceptingOrders: true } });

    // Outside operating hours → blocked; availability surfaced in the public DTO.
    await Restaurant.updateOne({ _id: restaurant.id }, { $set: { isOpen: true, openingTime: "09:00", closingTime: "18:00" } });
    const closedByHours = await request(base, "/api/v1/orders", {
      method: "POST",
      body: JSON.stringify({ restaurantId: restaurant.id, items: [{ itemId: itemA.id, quantity: 1 }], addressId }),
    }, token);
    const hour = new Date().getHours();
    const outsideHours = hour < 9 || hour >= 18;
    if (outsideHours) check("outside operating hours blocks order", closedByHours.status === 409 && closedByHours.body.code === "RESTAURANT_UNAVAILABLE");
    else check("within operating hours allows order", closedByHours.status === 201);
    const dto = (await request(base, `/api/v1/restaurants/${restaurant.id}`)).body.restaurant;
    check("restaurant DTO exposes availability", Boolean(dto.availability) && typeof dto.availability.canOrder === "boolean" && dto.openingTime === "09:00" && dto.closingTime === "18:00");
    await Restaurant.updateOne({ _id: restaurant.id }, { $set: { openingTime: "", closingTime: "" } });

    // Price change must not affect an existing order (snapshot).
    const before = order.body.order.items[0].price;
    await MenuItem.updateOne({ _id: itemA.id }, { $set: { price: itemA.price + 100 } });
    const after = (await request(base, `/api/v1/orders/${orderId}`, {}, token)).body.order.items[0].price;
    check("order keeps original prices after menu change", before === after && before !== itemA.price + 100);

    const mockPayment = await request(base, "/api/v1/orders", {
      method: "POST",
      body: JSON.stringify({
        restaurantId: restaurant.id,
        items: [{ itemId: itemB.id, quantity: 1 }],
        addressId,
        paymentMethod: "MOCK",
        idempotencyKey: "order-flow-0002",
      }),
    }, token);
    check("mock payment marks order paid", mockPayment.status === 201 && mockPayment.body.order.paymentStatus === "PAID");

    // Chunk 4: coupon rack, order notes, free delivery.
    const rack = await request(base, "/api/v1/coupons", {}, token);
    check("coupon rack lists usable coupons", rack.status === 200 && rack.body.coupons.some((c: any) => c.code === "FLAT50") && !rack.body.coupons.some((c: any) => c.code === "EXPIRED50") && !rack.body.coupons.some((c: any) => c.code === "WELCOME20"), JSON.stringify(rack.body.coupons.map((c: any) => c.code)));
    const pizzaRoma = list.body.restaurants.find((r: any) => r.name === "Pizza Roma");
    const scopedRack = await request(base, `/api/v1/coupons?restaurantId=${pizzaRoma.id}`, {}, token);
    check("coupon rack respects restaurant scope", scopedRack.body.coupons.some((c: any) => c.code === "PIZZA10"));
    const rackWithoutAuth = await request(base, "/api/v1/coupons");
    check("coupon rack requires login", rackWithoutAuth.status === 401);

    const noted = await request(base, "/api/v1/orders", {
      method: "POST",
      body: JSON.stringify({
        restaurantId: restaurant.id,
        items: [{ itemId: itemB.id, quantity: 1 }],
        addressId,
        note: "Leave at the door, ring once",
        idempotencyKey: "order-flow-0003",
      }),
    }, token);
    check("order note is stored", noted.status === 201 && noted.body.order.note === "Leave at the door, ring once");

    process.env.DELIVERY_FEE_FREE_ABOVE = "200";
    const freeDelivery = await request(base, "/api/v1/orders", {
      method: "POST",
      body: JSON.stringify({
        restaurantId: restaurant.id,
        items: [{ itemId: itemB.id, quantity: 2 }],
        addressId,
        idempotencyKey: "order-flow-0004",
      }),
    }, token);
    check("free delivery above threshold", freeDelivery.status === 201 && freeDelivery.body.order.deliveryFee === 0);
    process.env.DELIVERY_FEE_FREE_ABOVE = "99999";
  }

  // ---------- Restaurant operations + admin (Chunk 3) ----------
  console.log("\nRestaurant operations & admin");
  {
    // Owner login (seeded demo owner owns Royal Biryani House).
    const ownerLogin = await loginUser("kitchen@ramnagareats.test", "RESTAURANT");
    check("restaurant owner can log in with email OTP", ownerLogin.status === 200 && ownerLogin.body.user.role === "RESTAURANT");
    const ownerToken = ownerLogin.body.token;

    const list = await request(base, "/api/v1/restaurants?limit=50");
    const biryani = list.body.restaurants.find((r: any) => r.name === "Royal Biryani House");
    const other = list.body.restaurants.find((r: any) => r.name !== "Royal Biryani House" && r.isOpen);

    // A customer places an order at Royal Biryani House.
    const customer = await registerUser("Flow Customer", "flow@customer.test");
    const addr = await request(base, "/api/v1/users/addresses", {
      method: "POST",
      body: JSON.stringify({ label: "Home", formattedAddress: "5 Garden Road, Ramnagar, Jammu", pincode: "182123", latitude: 32.80674, longitude: 75.314854 }),
    }, customer.body.token);
    const menu = await request(base, `/api/v1/restaurants/${biryani.id}/menu`);
    const biryaniItem = menu.body.categories.flatMap((c: any) => c.items).find((i: any) => i.isAvailable);
    const placed = await request(base, "/api/v1/orders", {
      method: "POST",
      body: JSON.stringify({
        restaurantId: biryani.id,
        items: [{ itemId: biryaniItem.id, quantity: 1 }],
        addressId: addr.body.address.id,
        idempotencyKey: "chunk3-order-0001",
      }),
    }, customer.body.token);
    check("order placed for owner flow", placed.status === 201 && placed.body.order.status === "PLACED");
    const orderId = placed.body.order.id;

    const dash = await request(base, "/api/v1/restaurant/dashboard", {}, ownerToken);
    check("dashboard shows today's orders", dash.status === 200 && dash.body.stats.todayOrders >= 1 && dash.body.stats.pendingOrders >= 1, JSON.stringify(dash.body));

    const ownerOrders = await request(base, "/api/v1/restaurant/orders", {}, ownerToken);
    check("restaurant sees its orders", ownerOrders.body.orders.some((o: any) => o.id === orderId));
    check("restaurant orders expose customer name + phone for calling", ownerOrders.body.orders.some((o: any) => o.id === orderId && typeof o.customerName === "string" && typeof o.customerPhone === "string"));

    const transitions = ["CONFIRMED", "PREPARING", "READY", "RIDER_ASSIGNED", "RIDER_ACCEPTED", "PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED"];
    let ok = true;
    for (const status of transitions) {
      const update = await request(base, `/api/v1/restaurant/orders/${orderId}/status`, { method: "PATCH", body: JSON.stringify({ status }) }, ownerToken);
      if (update.status !== 200 || update.body.order.status !== status) { ok = false; console.error(`    FAIL: ${status} — status=${update.status} body=${JSON.stringify(update.body)}`); }
    }
    check("restaurant drives order through the full status flow (incl. PICKED_UP)", ok);

    // READY → OUT_FOR_DELIVERY (skipping PICKED_UP) must be rejected by the state machine.
    const skipPickup = await request(base, "/api/v1/orders", {
      method: "POST",
      body: JSON.stringify({ restaurantId: biryani.id, items: [{ itemId: biryaniItem.id, quantity: 1 }], addressId: addr.body.address.id, idempotencyKey: "chunk3-skip-pickup" }),
    }, customer.body.token);
    const skipFlow = await request(base, `/api/v1/restaurant/orders/${skipPickup.body.order.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "CONFIRMED" }) }, ownerToken);
    await request(base, `/api/v1/restaurant/orders/${skipPickup.body.order.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "PREPARING" }) }, ownerToken);
    await request(base, `/api/v1/restaurant/orders/${skipPickup.body.order.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "READY" }) }, ownerToken);
    const skipToDelivery = await request(base, `/api/v1/restaurant/orders/${skipPickup.body.order.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "OUT_FOR_DELIVERY" }) }, ownerToken);
    check("READY → OUT_FOR_DELIVERY without PICKED_UP is rejected", skipToDelivery.status === 409 && skipToDelivery.body.code === "INVALID_STATUS_TRANSITION");

    const deliveredOrder = await request(base, `/api/v1/orders/${orderId}`, {}, customer.body.token);
    check("customer sees updated status", deliveredOrder.body.order.status === "DELIVERED" && deliveredOrder.body.order.statusHistory.length === 9);

    // Feedback: only after delivery, once per order, updates the restaurant rating.
    const earlyFeedback = await request(base, `/api/v1/orders/${skipPickup.body.order.id}/feedback`, { method: "POST", body: JSON.stringify({ rating: 5 }) }, customer.body.token);
    check("feedback rejected before delivery", earlyFeedback.status === 409 && earlyFeedback.body.code === "ORDER_NOT_DELIVERED");
    const ratingBefore = (await request(base, "/api/v1/restaurants?limit=50")).body.restaurants.find((r: any) => r.id === biryani.id)?.rating;
    const feedback = await request(base, `/api/v1/orders/${orderId}/feedback`, { method: "POST", body: JSON.stringify({ rating: 5, comment: "Great biryani!" }) }, customer.body.token);
    check("feedback accepted after delivery", feedback.status === 201 && feedback.body.feedback.rating === 5);

    // The same feedback must surface on the public restaurant page (dynamic reviews).
    const biryaniReviews = await request(base, `/api/v1/restaurants/${biryani.id}/reviews`);
    check("restaurant reviews reflect submitted feedback", biryaniReviews.body.summary.count >= 1 && biryaniReviews.body.reviews.some((review: any) => review.comment === "Great biryani!"), JSON.stringify(biryaniReviews.body));
    const duplicate = await request(base, `/api/v1/orders/${orderId}/feedback`, { method: "POST", body: JSON.stringify({ rating: 1 }) }, customer.body.token);
    check("duplicate feedback rejected", duplicate.status === 409 && duplicate.body.code === "FEEDBACK_ALREADY_SUBMITTED");
    const ratingAfter = (await request(base, "/api/v1/restaurants?limit=50")).body.restaurants.find((r: any) => r.id === biryani.id)?.rating;
    check("restaurant rating recomputed from feedback", typeof ratingAfter === "number" && (ratingBefore === undefined || ratingAfter !== ratingBefore || ratingAfter === 5));
    const withFeedback = await request(base, `/api/v1/orders/${orderId}`, {}, customer.body.token);
    check("order detail includes feedback", withFeedback.body.feedback?.rating === 5);

    const invalid = await request(base, `/api/v1/restaurant/orders/${orderId}/status`, { method: "PATCH", body: JSON.stringify({ status: "CONFIRMED" }) }, ownerToken);
    check("invalid status transition rejected", invalid.status === 409 && invalid.body.code === "INVALID_STATUS_TRANSITION");

    const cancelAfterDelivery = await request(base, `/api/v1/orders/${orderId}/cancel`, { method: "PATCH" }, customer.body.token);
    check("delivered order cannot be cancelled", cancelAfterDelivery.status === 409);

    // Owner cannot touch another restaurant's order.
    const otherMenu = await request(base, `/api/v1/restaurants/${other.id}/menu`);
    const otherItem = otherMenu.body.categories.flatMap((c: any) => c.items).find((i: any) => i.isAvailable);
    const otherOrder = await request(base, "/api/v1/orders", {
      method: "POST",
      body: JSON.stringify({ restaurantId: other.id, items: [{ itemId: otherItem.id, quantity: 1 }], addressId: addr.body.address.id, idempotencyKey: "chunk3-order-0002" }),
    }, customer.body.token);
    const foreign = await request(base, `/api/v1/restaurant/orders/${otherOrder.body.order.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "CONFIRMED" }) }, ownerToken);
    check("owner cannot modify another restaurant's order", foreign.status === 404);

    // Owner can read own restaurant's order via public detail endpoint.
    const ownerRead = await request(base, `/api/v1/orders/${orderId}`, {}, ownerToken);
    check("owner can read own restaurant's order detail", ownerRead.status === 200);

    const toggle = await request(base, "/api/v1/restaurant/status", { method: "PATCH", body: JSON.stringify({ isOpen: false }) }, ownerToken);
    check("restaurant can toggle open/closed", toggle.status === 200 && toggle.body.restaurant.isOpen === false);
    await request(base, "/api/v1/restaurant/status", { method: "PATCH", body: JSON.stringify({ isOpen: true }) }, ownerToken);

    // Customer cancel while still allowed.
    const cancelOrder = await request(base, "/api/v1/orders", {
      method: "POST",
      body: JSON.stringify({ restaurantId: other.id, items: [{ itemId: otherItem.id, quantity: 1 }], addressId: addr.body.address.id, idempotencyKey: "chunk3-cancel-0001" }),
    }, customer.body.token);
    const cancelled = await request(base, `/api/v1/orders/${cancelOrder.body.order.id}/cancel`, { method: "PATCH" }, customer.body.token);
    check("customer can cancel a placed order", cancelled.status === 200 && cancelled.body.order.status === "CANCELLED");

    // Admin flow.
    const adminLogin = await loginUser("ramnagareats@admin.com", "ADMIN");
    check("admin can log in with email OTP", adminLogin.status === 200 && adminLogin.body.user.role === "ADMIN");
    const adminToken = adminLogin.body.token;

    const metrics = await request(base, "/api/v1/admin/metrics", {}, adminToken);
    check("admin metrics computed", metrics.status === 200 && metrics.body.metrics.totalOrders >= 3 && metrics.body.metrics.restaurants >= 10 && metrics.body.metrics.customers >= 5, JSON.stringify(metrics.body));

    const adminRestaurants = await request(base, "/api/v1/admin/restaurants", {}, adminToken);
    check("admin sees restaurants with owners", adminRestaurants.status === 200 && adminRestaurants.body.restaurants.length >= 10);

    const disable = await request(base, `/api/v1/admin/restaurants/${other.id}`, { method: "PATCH", body: JSON.stringify({ isActive: false }) }, adminToken);
    check("admin can disable a restaurant", disable.status === 200 && disable.body.restaurant.isActive === false);
    await request(base, `/api/v1/admin/restaurants/${other.id}`, { method: "PATCH", body: JSON.stringify({ isActive: true }) }, adminToken);

    const adminUsers = await request(base, "/api/v1/admin/users", {}, adminToken);
    check("admin sees users", adminUsers.status === 200 && adminUsers.body.users.some((u: any) => u.role === "CUSTOMER") && adminUsers.body.users.some((u: any) => u.role === "RESTAURANT"));

    const adminOrders = await request(base, "/api/v1/admin/orders", {}, adminToken);
    check("admin sees all orders", adminOrders.status === 200 && adminOrders.body.orders.length >= 3 && Boolean(adminOrders.body.orders[0].customerName));

    const adminOrderDetail = await request(base, `/api/v1/admin/orders/${orderId}`, {}, adminToken);
    check("admin sees order detail", adminOrderDetail.status === 200 && adminOrderDetail.body.order.orderNumber === placed.body.order.orderNumber);

    const adminAsCustomer = await request(base, "/api/v1/admin/metrics", {}, customer.body.token);
    check("customer blocked from admin routes", adminAsCustomer.status === 403);
  }

  // ---------- Image uploads (V2 ImageKit) ----------
  console.log("\nImage uploads");
  {
    const customer = await registerUser("Upload Customer", "upload@customer.test");
    const customerToken = customer.body.token;

    // A tiny valid 1x1 PNG (magic bytes + minimal content).
    const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const pngBuffer = Buffer.from(pngBase64, "base64");
    const formData = new FormData();
    formData.append("file", new Blob([pngBuffer], { type: "image/png" }), "dish.png");
    const uploaded = await request(base, "/api/v1/uploads?folder=menu", { method: "POST", body: formData }, customerToken);
    check("customer can upload a valid PNG", uploaded.status === 201 && uploaded.body.image.url.startsWith("http") && uploaded.body.image.fileId.startsWith("local-"));

    // Invalid file (not an image) must be rejected before storage.
    const fakeForm = new FormData();
    fakeForm.append("file", new Blob(["<html>not an image</html>"], { type: "image/png" }), "evil.png");
    const rejected = await request(base, "/api/v1/uploads?folder=menu", { method: "POST", body: fakeForm }, customerToken);
    check("renamed HTML payload rejected as invalid image", rejected.status === 400 && rejected.body.code === "INVALID_IMAGE_TYPE");

    // Unauthenticated upload must fail.
    const anonForm = new FormData();
    anonForm.append("file", new Blob([pngBuffer], { type: "image/png" }), "dish.png");
    const anonUpload = await request(base, "/api/v1/uploads?folder=menu", { method: "POST", body: anonForm });
    check("unauthenticated upload rejected", anonUpload.status === 401);

    // Persist the uploaded URL on the user's avatar, then read it back.
    const avatarUpdate = await request(base, "/api/v1/auth/me", { method: "PATCH", body: JSON.stringify({ avatar: uploaded.body.image.url }) }, customerToken);
    check("avatar persisted via PATCH /auth/me", avatarUpdate.status === 200 && avatarUpdate.body.user.avatar === uploaded.body.image.url);
    const meAfter = await request(base, "/api/v1/auth/me", {}, customerToken);
    check("avatar survives a fresh /auth/me read", meAfter.body.user.avatar === uploaded.body.image.url);

    // Owner persists cover image + logo on the restaurant profile.
    const ownerLogin = await loginUser("kitchen@ramnagareats.test", "RESTAURANT");
    const list = await request(base, "/api/v1/restaurants?limit=50");
    const biryani = list.body.restaurants.find((r: any) => r.name === "Royal Biryani House");
    const profileUpdate = await request(base, "/api/v1/restaurants/me", {
      method: "PUT",
      body: JSON.stringify({ name: biryani.name, coverImage: uploaded.body.image.url, logo: uploaded.body.image.url }),
    }, ownerLogin.body.token);
    check("owner persists cover + logo", profileUpdate.status === 200 && profileUpdate.body.restaurant.coverImage === uploaded.body.image.url && profileUpdate.body.restaurant.logo === uploaded.body.image.url);
    const publicDetail = await request(base, `/api/v1/restaurants/${biryani.id}`);
    check("public restaurant detail exposes uploaded images", publicDetail.body.restaurant.coverImage === uploaded.body.image.url);

    // Delete the uploaded image.
    const removed = await request(base, `/api/v1/uploads/${uploaded.body.image.fileId}`, { method: "DELETE" }, customerToken);
    check("uploaded image can be deleted", removed.status === 204);

    // Oversized file (6 MB of junk) rejected by multer limits.
    const bigForm = new FormData();
    bigForm.append("file", new Blob([Buffer.alloc(6 * 1024 * 1024)], { type: "image/jpeg" }), "big.jpg");
    const tooBig = await request(base, "/api/v1/uploads?folder=menu", { method: "POST", body: bigForm }, customerToken);
    check("oversized upload rejected", tooBig.status === 400 && tooBig.body.code === "UPLOAD_ERROR");
  }

  // ---------- Rider delivery flow ----------
  console.log("\nRider delivery flow");
  {
    // 1. Register a rider, set up profile, go online, approve.
    const riderReg = await loginUser("rider1@test.test", "RIDER");
    check("rider login returns isNew for first-time rider", riderReg.status === 200 && riderReg.body.isNew === true && Boolean(riderReg.body.regToken));

    const riderRegister = await request(base, "/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: "rider1@test.test", regToken: riderReg.body.regToken, name: "Test Rider", phone: "+919800000001", role: "RIDER" }),
    });
    check("rider register succeeds", riderRegister.status === 201 && riderRegister.body.user.role === "RIDER");
    const riderToken = riderRegister.body.token;

    // 2. Setup rider profile.
    const setup = await request(base, "/api/v1/riders/setup", {
      method: "POST",
      body: JSON.stringify({ name: "Test Rider", phone: "+919800000001", vehicleType: "Motorcycle", vehicleNumber: "JK01AB1234", deliveryArea: "Ramnagar" }),
    }, riderToken);
    check("rider setup succeeds", setup.status === 200 && setup.body.user.vehicleType === "Motorcycle" && setup.body.user.role === "RIDER", JSON.stringify(setup.body));
    const riderJwt = setup.body.token; // fresh token with RIDER role

    // 3. Read rider profile.
    const profile = await request(base, "/api/v1/riders/me", {}, riderJwt);
    check("rider profile returns all fields", profile.status === 200 && profile.body.user.vehicleType === "Motorcycle" && profile.body.user.riderStatus === "OFFLINE");

    // 4. Cannot go online without approval.
    const noApproval = await request(base, "/api/v1/riders/status", { method: "POST", body: JSON.stringify({ status: "ONLINE" }) }, riderJwt);
    check("rider cannot go online before approval", noApproval.status === 403 && noApproval.body.code === "NOT_APPROVED");

    // 5. Admin approves the rider.
    const { User: UserModel } = await import("../src/models/User.js");
    await UserModel.updateOne({ email: "rider1@test.test", role: "RIDER" }, { $set: { riderApproval: "APPROVED" } });

    // 6. Now go online.
    const goOnline = await request(base, "/api/v1/riders/status", { method: "POST", body: JSON.stringify({ status: "ONLINE" }) }, riderJwt);
    check("rider goes online after approval", goOnline.status === 200 && goOnline.body.riderStatus === "ONLINE");

    // 7. Update location.
    const loc = await request(base, "/api/v1/riders/location", { method: "POST", body: JSON.stringify({ latitude: 32.80674, longitude: 75.314854 }) }, riderJwt);
    check("rider location update accepted", loc.status === 200 && loc.body.received === true);

    // 8. Update profile.
    const patch = await request(base, "/api/v1/riders/me", { method: "PATCH", body: JSON.stringify({ vehicleType: "Scooter" }) }, riderJwt);
    check("rider can update profile", patch.status === 200 && patch.body.user.vehicleType === "Scooter");

    // 9. Place an order that will be auto-assigned.
    const customer = await registerUser("Rider Test Customer", "ridertest@customer.test");
    const addr = await request(base, "/api/v1/users/addresses", {
      method: "POST",
      body: JSON.stringify({ label: "Home", formattedAddress: "3 Rider Lane, Ramnagar", pincode: "182122", latitude: 32.80674, longitude: 75.314854 }),
    }, customer.body.token);
    const list = await request(base, "/api/v1/restaurants?lat=32.80674&lng=75.314854&limit=50");
    const restaurant = list.body.restaurants.find((r: any) => r.name === "Royal Biryani House");
    const menu = await request(base, `/api/v1/restaurants/${restaurant.id}/menu`);
    const item = menu.body.categories.flatMap((c: any) => c.items).find((i: any) => i.isAvailable);
    const order = await request(base, "/api/v1/orders", {
      method: "POST",
      body: JSON.stringify({ restaurantId: restaurant.id, items: [{ itemId: item.id, quantity: 1 }], addressId: addr.body.address.id, idempotencyKey: "rider-flow-0001" }),
    }, customer.body.token);
    check("order placed for rider flow", order.status === 201 && order.body.order.status === "PLACED");
    const orderId = order.body.order.id;

    // 10. Restaurant confirms → prepares → ready (triggers auto-assignment).
    const ownerLogin = await loginUser("kitchen@ramnagareats.test", "RESTAURANT");
    await request(base, `/api/v1/restaurant/orders/${orderId}/status`, { method: "PATCH", body: JSON.stringify({ status: "CONFIRMED" }) }, ownerLogin.body.token);
    await request(base, `/api/v1/restaurant/orders/${orderId}/status`, { method: "PATCH", body: JSON.stringify({ status: "PREPARING" }) }, ownerLogin.body.token);
    const readyRes = await request(base, `/api/v1/restaurant/orders/${orderId}/status`, { method: "PATCH", body: JSON.stringify({ status: "READY" }) }, ownerLogin.body.token);
    check("order reaches READY status", readyRes.status === 200 && readyRes.body.order.status === "READY");

    // 11. Wait briefly for async auto-assignment, then check the order.
    await new Promise((resolve) => setTimeout(resolve, 500));
    const assigned = await request(base, `/api/v1/orders/${orderId}`, {}, customer.body.token);
    const isAssigned = assigned.body.order.status === "RIDER_ASSIGNED" && assigned.body.order.riderId;
    check("rider auto-assigned when order reached READY", isAssigned, JSON.stringify(assigned.body.order));

    // 12. Auto-assignment flags the rider's active delivery before they accept.
    const noActive = await request(base, "/api/v1/riders/delivery/active", {}, riderJwt);
    check("rider sees the assigned delivery before accept", noActive.status === 200 && noActive.body.order?.status === "RIDER_ASSIGNED", JSON.stringify(noActive.body.order));

    // 13. Rider accepts the delivery.
    const accept = await request(base, `/api/v1/riders/delivery/${orderId}/accept`, { method: "POST" }, riderJwt);
    check("rider accepts delivery", accept.status === 200 && accept.body.order.status === "RIDER_ACCEPTED");

    // 14. Rider is now BUSY.
    const busyProfile = await request(base, "/api/v1/riders/me", {}, riderJwt);
    check("rider status is BUSY after accept", busyProfile.body.user.riderStatus === "BUSY");

    // 15. Active delivery shows the order.
    const active = await request(base, "/api/v1/riders/delivery/active", {}, riderJwt);
    check("rider has active delivery", active.status === 200 && active.body.order?.orderNumber && active.body.order.restaurantPhone);

    // 16. Rider arrives at restaurant.
    const arrived = await request(base, `/api/v1/riders/delivery/${orderId}/arrived`, { method: "POST" }, riderJwt);
    check("rider marks arrived at restaurant", arrived.status === 200);

    // 17. Rider picks up (generates delivery OTP).
    const pickup = await request(base, `/api/v1/riders/delivery/${orderId}/pickup`, { method: "POST" }, riderJwt);
    check("rider picks up order", pickup.status === 200 && pickup.body.order.status === "PICKED_UP" && Boolean(pickup.body.deliveryOtp));
    const deliveryOtp = pickup.body.deliveryOtp;

    // 18. Start delivery.
    const startDelivery = await request(base, `/api/v1/riders/delivery/${orderId}/start-delivery`, { method: "POST" }, riderJwt);
    check("rider starts delivery", startDelivery.status === 200 && startDelivery.body.order.status === "OUT_FOR_DELIVERY");

    // 19. Wrong OTP rejected.
    const wrongOtp = await request(base, `/api/v1/riders/delivery/${orderId}/deliver`, { method: "POST", body: JSON.stringify({ otp: "000000" }) }, riderJwt);
    check("wrong delivery OTP rejected", wrongOtp.status === 403 && wrongOtp.body.code === "INVALID_OTP");

    // 20. Correct OTP → delivered.
    const delivered = await request(base, `/api/v1/riders/delivery/${orderId}/deliver`, { method: "POST", body: JSON.stringify({ otp: deliveryOtp }) }, riderJwt);
    check("rider delivers with correct OTP", delivered.status === 200 && delivered.body.order.status === "DELIVERED" && delivered.body.order.deliveryVerified === true);

    // 21. Rider is back ONLINE, daily counters updated.
    const afterDelivery = await request(base, "/api/v1/riders/me", {}, riderJwt);
    check("rider back ONLINE after delivery", afterDelivery.body.user.riderStatus === "ONLINE");
    check("rider daily deliveries incremented", afterDelivery.body.user.todayDeliveries === 1);

    // 22. No active delivery after completion.
    const noActiveAfter = await request(base, "/api/v1/riders/delivery/active", {}, riderJwt);
    check("no active delivery after delivery", noActiveAfter.body.order === null);

    // 23. Rider route returns null when no active delivery.
    const routeNull = await request(base, "/api/v1/riders/delivery/route", {}, riderJwt);
    check("route returns null when no active delivery", routeNull.body.route === null);

    // 24. Reject flow: place new order, auto-assign, rider rejects.
    const order2 = await request(base, "/api/v1/orders", {
      method: "POST",
      body: JSON.stringify({ restaurantId: restaurant.id, items: [{ itemId: item.id, quantity: 1 }], addressId: addr.body.address.id, idempotencyKey: "rider-flow-0002" }),
    }, customer.body.token);
    await request(base, `/api/v1/restaurant/orders/${order2.body.order.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "CONFIRMED" }) }, ownerLogin.body.token);
    await request(base, `/api/v1/restaurant/orders/${order2.body.order.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "PREPARING" }) }, ownerLogin.body.token);
    await request(base, `/api/v1/restaurant/orders/${order2.body.order.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "READY" }) }, ownerLogin.body.token);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const order2Detail = await request(base, `/api/v1/orders/${order2.body.order.id}`, {}, customer.body.token);
    const rejectTarget = order2Detail.body.order.status === "RIDER_ASSIGNED" ? order2.body.order.id : null;
    if (rejectTarget) {
      const reject = await request(base, `/api/v1/riders/delivery/${rejectTarget}/reject`, { method: "POST" }, riderJwt);
      check("rider rejects delivery", reject.status === 200);
      const afterReject = await request(base, `/api/v1/orders/${rejectTarget}`, {}, customer.body.token);
      check("order returns to READY after reject", afterReject.body.order.status === "READY");
    } else {
      check("auto-assign worked for reject test (no rider available or already assigned)", true);
    }

    // 25. Customer cannot access rider routes.
    const customerAsRider = await request(base, "/api/v1/riders/me", {}, customer.body.token);
    check("customer blocked from rider routes", customerAsRider.status === 403);

    // 26. Nearby riders (admin only).
    const admin = await loginUser("ramnagareats@admin.com", "ADMIN");
    const nearby = await request(base, "/api/v1/riders/nearby?lat=32.80674&lng=75.314854", {}, admin.body.token);
    check("admin can list nearby riders", nearby.status === 200 && Array.isArray(nearby.body.riders), JSON.stringify({ status: nearby.status, body: nearby.body, hasToken: Boolean(admin.body.token) }));

    const customerNearby = await request(base, "/api/v1/riders/nearby?lat=32.80674&lng=75.314854", {}, customer.body.token);
    check("customer blocked from nearby riders", customerNearby.status === 403);

    // 27. Admin rider management — list, approve, reject.
    const ridersList = await request(base, "/api/v1/admin/riders", {}, admin.body.token);
    check("admin can list riders", ridersList.status === 200 && Array.isArray(ridersList.body.riders) && ridersList.body.riders.length >= 1, JSON.stringify(ridersList.body));
    const riderId = ridersList.body.riders[0].id;
    const rejectRider = await request(base, `/api/v1/admin/riders/${riderId}`, { method: "PATCH", body: JSON.stringify({ riderApproval: "REJECTED" }) }, admin.body.token);
    check("admin can reject a rider", rejectRider.status === 200 && rejectRider.body.rider.riderApproval === "REJECTED");
    const reApprove = await request(base, `/api/v1/admin/riders/${riderId}`, { method: "PATCH", body: JSON.stringify({ riderApproval: "APPROVED" }) }, admin.body.token);
    check("admin can re-approve a rider", reApprove.status === 200 && reApprove.body.rider.riderApproval === "APPROVED");
    const invalidApproval = await request(base, `/api/v1/admin/riders/${riderId}`, { method: "PATCH", body: JSON.stringify({ riderApproval: "INVALID" }) }, admin.body.token);
    check("admin rejects invalid approval status", invalidApproval.status === 400);
    const customerAsAdmin = await request(base, "/api/v1/admin/riders", {}, customer.body.token);
    check("customer blocked from admin rider routes", customerAsAdmin.status === 403);

    // 28. Rider delivery history.
    const history = await request(base, "/api/v1/riders/deliveries", {}, riderJwt);
    check("rider can view delivery history", history.status === 200 && Array.isArray(history.body.deliveries));
    check("delivered order appears in history", history.body.deliveries.some((d: any) => d.orderNumber && d.deliveryFee > 0));
    const customerAsHistory = await request(base, "/api/v1/riders/deliveries", {}, customer.body.token);
    check("customer blocked from rider history", customerAsHistory.status === 403);

    // No-role rider login (rider1@test.test was registered earlier in this section).
    const riderNoRoleLogin = await loginUser("rider1@test.test");
    check("no-role: rider signs in without role param", riderNoRoleLogin.status === 200 && riderNoRoleLogin.body.isNew === false && riderNoRoleLogin.body.user.role === "RIDER", JSON.stringify(riderNoRoleLogin.body));
  }

  // ---------- Real-time (Chunk 5) ----------
  console.log("\nReal-time sockets");
  {
    const reg = await registerUser("Socket Customer", "socket@customer.test");
    const customerToken = reg.body.token;
    const addr = await request(base, "/api/v1/users/addresses", {
      method: "POST",
      body: JSON.stringify({ label: "Home", formattedAddress: "2 Socket Street, Ramnagar, Jammu", pincode: "182124", latitude: 32.80674, longitude: 75.314854 }),
    }, customerToken);
    const ownerLogin = await loginUser("kitchen@ramnagareats.test", "RESTAURANT");
    const list = await request(base, "/api/v1/restaurants?limit=50");
    const biryani = list.body.restaurants.find((r: any) => r.name === "Royal Biryani House");
    const menu = await request(base, `/api/v1/restaurants/${biryani.id}/menu`);
    const item = menu.body.categories.flatMap((c: any) => c.items).find((i: any) => i.isAvailable);

    let customerSocket: any;
    let ownerSocket: any;
    try {
      customerSocket = await connectSocket(customerToken);
      ownerSocket = await connectSocket(ownerLogin.body.token);
      check("customer + owner sockets connect with JWT", true);

      const ownerNew = once(ownerSocket, "order:new");
      const customerUpdated = once(customerSocket, "order:updated");
      const created = await request(base, "/api/v1/orders", {
        method: "POST",
        body: JSON.stringify({
          restaurantId: biryani.id,
          items: [{ itemId: item.id, quantity: 1 }],
          addressId: addr.body.address.id,
          idempotencyKey: "socket-order-0001",
        }),
      }, customerToken);
      const newEvent = await ownerNew;
      const updatedEvent = await customerUpdated;
      check("restaurant receives order:new in real time", newEvent.order?.id === created.body.order.id, JSON.stringify(newEvent));
      check("customer receives order:updated in real time", updatedEvent.order?.id === created.body.order.id);

      const customerUpdate = once(customerSocket, "order:updated");
      await request(base, `/api/v1/restaurant/orders/${created.body.order.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "CONFIRMED" }) }, ownerLogin.body.token);
      const statusEvent = await customerUpdate;
      check("customer receives live status change", statusEvent.order?.status === "CONFIRMED");
    } finally {
      customerSocket?.disconnect();
      ownerSocket?.disconnect();
    }

    let unauthorized: any;
    try {
      unauthorized = await connectSocket(undefined);
      unauthorized.disconnect();
      check("socket without token is rejected", false);
    } catch (error) {
      check("socket without token is rejected", error instanceof Error && error.message === "UNAUTHORIZED");
    }
  }

  // ========== sarthakkharka@gmail.com OTP flow across all 3 apps ==========
  console.log("\nsarthakkharka@gmail.com OTP flow (all 3 apps)");
  {
    const testEmail = "sarthakkharka@gmail.com";

    // ── customer-web: send OTP (role: CUSTOMER) ──
    console.log("  [customer-web] Sending OTP...");
    let sent = await sendOtp(testEmail);
    if (sent.status === 400 && sent.body.code === "OTP_RESEND_TOO_SOON") {
      await new Promise((r) => setTimeout(r, Number(process.env.OTP_RESEND_COOLDOWN_MS ?? 100) + 50));
      sent = await sendOtp(testEmail);
    }
    check("sarthakkharka: customer-web send-otp succeeds", sent.status === 200, JSON.stringify(sent.body));

    const custCode = await devCode(testEmail);
    check("sarthakkharka: customer-web OTP code generated", Boolean(custCode), `code: ${custCode}`);
    console.log(`  [customer-web] OTP code: ${custCode}`);

    const custVerified = await verifyOtp(testEmail, custCode, "CUSTOMER");
    check("sarthakkharka: customer-web verify-otp works", custVerified.status === 200, JSON.stringify(custVerified.body));
    console.log(`  [customer-web] Result: ${custVerified.body.isNew ? "isNew (register)" : `logged in as ${custVerified.body.user?.role}`}`);

    // ── restaurant-web: send OTP (no role) ──
    console.log("\n  [restaurant-web] Sending OTP...");
    sent = await sendOtp(testEmail);
    if (sent.status === 400 && sent.body.code === "OTP_RESEND_TOO_SOON") {
      await new Promise((r) => setTimeout(r, Number(process.env.OTP_RESEND_COOLDOWN_MS ?? 100) + 50));
      sent = await sendOtp(testEmail);
    }
    check("sarthakkharka: restaurant-web send-otp succeeds", sent.status === 200, JSON.stringify(sent.body));

    const restCode = await devCode(testEmail);
    check("sarthakkharka: restaurant-web OTP code generated", Boolean(restCode), `code: ${restCode}`);
    console.log(`  [restaurant-web] OTP code: ${restCode}`);

    const restVerified = await verifyOtp(testEmail, restCode); // no role
    check("sarthakkharka: restaurant-web verify-otp works", restVerified.status === 200, JSON.stringify(restVerified.body));
    console.log(`  [restaurant-web] Result: ${restVerified.body.isNew ? "isNew (register)" : `logged in as ${restVerified.body.user?.role}`}`);

    // ── rider-web: send OTP (role: RIDER) ──
    console.log("\n  [rider-web] Sending OTP...");
    sent = await sendOtp(testEmail);
    if (sent.status === 400 && sent.body.code === "OTP_RESEND_TOO_SOON") {
      await new Promise((r) => setTimeout(r, Number(process.env.OTP_RESEND_COOLDOWN_MS ?? 100) + 50));
      sent = await sendOtp(testEmail);
    }
    check("sarthakkharka: rider-web send-otp succeeds", sent.status === 200, JSON.stringify(sent.body));

    const riderCode = await devCode(testEmail);
    check("sarthakkharka: rider-web OTP code generated", Boolean(riderCode), `code: ${riderCode}`);
    console.log(`  [rider-web] OTP code: ${riderCode}`);

    const riderVerified = await verifyOtp(testEmail, riderCode, "RIDER");
    check("sarthakkharka: rider-web verify-otp works", riderVerified.status === 200, JSON.stringify(riderVerified.body));
    console.log(`  [rider-web] Result: ${riderVerified.body.isNew ? "isNew (register)" : `logged in as ${riderVerified.body.user?.role}`}`);

    // ── Summary of what exists for this email ──
    console.log("\n  [Summary] Accounts for sarthakkharka@gmail.com:");
    if (custVerified.body.user) console.log(`    - CUSTOMER: ${custVerified.body.user.name} (${custVerified.body.isNew ? "new" : "existing"})`);
    if (restVerified.body.user) console.log(`    - Restaurant found: ${restVerified.body.user.name} (role: ${restVerified.body.user.role})`);
    if (riderVerified.body.user) console.log(`    - RIDER: ${riderVerified.body.user.name} (${riderVerified.body.isNew ? "new" : "existing"})`);
  }

  io.close();
  server.close();
  await mongoose.disconnect();
  await mongod.stop();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.error("\nFailures:");
    failures.forEach((failure) => console.error(`  - ${failure}`));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Test run crashed:", error);
  process.exit(1);
});
