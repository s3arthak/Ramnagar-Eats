/**
 * Test all sign-in scenarios across customer-web, restaurant-web, and rider-web.
 *
 * Current DB state: only ramnagareats@gmail.com (ADMIN) exists.
 *
 * Each app sends different roles in verify-otp:
 *   - customer-web: role: "CUSTOMER"
 *   - restaurant-web: no role (finds any user)
 *   - rider-web: role: "RIDER"
 */

const API_BASE = "https://ramnagar-eats-backend.onrender.com/api/v1";

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${name}`);
  } else {
    failed += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function request(path, options = {}, token) {
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    redirect: "manual",
  });
  let body = null;
  try { body = await response.json(); } catch {}
  return { status: response.status, body, location: response.headers.get("location") };
}

async function sendOtp(email) {
  return request("/auth/send-otp", { method: "POST", body: { email } });
}

async function devCode(email) {
  const res = await request(`/auth/dev-otp?email=${encodeURIComponent(email)}`);
  return res.body?.code;
}

async function verifyOtp(email, code, role) {
  const body = { email, code };
  if (role) body.role = role;
  return request("/auth/verify-otp", { method: "POST", body });
}

async function register(email, regToken, name, role, phone) {
  const body = { email, regToken, name, role };
  if (phone) body.phone = phone;
  return request("/auth/register", { method: "POST", body });
}

async function me(token) {
  return request("/auth/me", {}, token);
}

// ── Helper: full sign-in or register flow ──
async function signInOrRegister(email, appName, role) {
  await sendOtp(email);
  const code = await devCode(email);
  const verified = await verifyOtp(email, code, role);
  if (verified.body?.isNew && verified.body?.regToken) {
    const reg = await register(email, verified.body.regToken, `${appName} User`, role || "CUSTOMER");
    return { token: reg.body?.token, user: reg.body?.user, isNew: true };
  }
  return { token: verified.body?.token, user: verified.body?.user, isNew: false };
}

// ══════════════════════════════════════════════════════════════
// TEST SCENARIOS
// ══════════════════════════════════════════════════════════════

async function main() {
  console.log("🧪 Testing all sign-in scenarios across 3 apps\n");
  console.log(`API: ${API_BASE}\n`);

  // ── Scenario 1: Admin sign-in on restaurant-web (no role) ──
  console.log("📋 Scenario 1: Admin sign-in on restaurant-web (no role)");
  {
    await sendOtp("ramnagareats@gmail.com");
    const code = await devCode("ramnagareats@gmail.com");
    const verified = await verifyOtp("ramnagareats@gmail.com", code); // no role
    check("restaurant-web: admin finds ADMIN account", verified.status === 200 && verified.body?.user?.role === "ADMIN" && verified.body?.isNew === false);
    check("restaurant-web: admin gets token", Boolean(verified.body?.token));

    const user = await me(verified.body?.token);
    check("restaurant-web: admin /auth/me works", user.status === 200 && user.body?.user?.role === "ADMIN");
  }

  // ── Scenario 2: Admin sign-in on customer-web (role: CUSTOMER) ──
  console.log("\n📋 Scenario 2: Admin sign-in on customer-web (role: CUSTOMER)");
  {
    await sendOtp("ramnagareats@gmail.com");
    const code = await devCode("ramnagareats@gmail.com");
    const verified = await verifyOtp("ramnagareats@gmail.com", code, "CUSTOMER");
    // With role: CUSTOMER, backend looks for { email, role: "CUSTOMER" } → not found → isNew
    check("customer-web: admin gets isNew (no CUSTOMER account)", verified.status === 200 && verified.body?.isNew === true && Boolean(verified.body?.regToken));
  }

  // ── Scenario 3: Admin sign-in on rider-web (role: RIDER) ──
  console.log("\n📋 Scenario 3: Admin sign-in on rider-web (role: RIDER)");
  {
    await sendOtp("ramnagareats@gmail.com");
    const code = await devCode("ramnagareats@gmail.com");
    const verified = await verifyOtp("ramnagareats@gmail.com", code, "RIDER");
    // With role: RIDER, backend looks for { email, role: "RIDER" } → not found → isNew
    check("rider-web: admin gets isNew (no RIDER account)", verified.status === 200 && verified.body?.isNew === true && Boolean(verified.body?.regToken));
  }

  // ── Scenario 4: Register CUSTOMER on customer-web ──
  console.log("\n📋 Scenario 4: Register CUSTOMER on customer-web");
  {
    const result = await signInOrRegister("ramnagareats@gmail.com", "Customer", "CUSTOMER");
    check("customer-web: CUSTOMER registration succeeds", result.isNew === true && result.user?.role === "CUSTOMER");
    check("customer-web: CUSTOMER gets token", Boolean(result.token));

    const user = await me(result.token);
    check("customer-web: CUSTOMER /auth/me works", user.status === 200 && user.body?.user?.role === "CUSTOMER");
  }

  // ── Scenario 5: Register RIDER on rider-web ──
  console.log("\n📋 Scenario 5: Register RIDER on rider-web");
  {
    const result = await signInOrRegister("ramnagareats@gmail.com", "Rider", "RIDER");
    check("rider-web: RIDER registration succeeds", result.isNew === true && result.user?.role === "RIDER");
    check("rider-web: RIDER gets token", Boolean(result.token));

    const user = await me(result.token);
    check("rider-web: RIDER /auth/me works", user.status === 200 && user.body?.user?.role === "RIDER");
  }

  // ── Scenario 6: Now sign in on all 3 apps ──
  console.log("\n📋 Scenario 6: Sign in on all 3 apps (ADMIN + CUSTOMER + RIDER exist)");

  // restaurant-web (no role) → finds first user (ADMIN)
  {
    await sendOtp("ramnagareats@gmail.com");
    const code = await devCode("ramnagareats@gmail.com");
    const verified = await verifyOtp("ramnagareats@gmail.com", code);
    check("restaurant-web: sign-in works (finds ADMIN)", verified.status === 200 && verified.body?.user?.role === "ADMIN" && verified.body?.isNew === false);
  }

  // customer-web (role: CUSTOMER) → finds CUSTOMER
  {
    await sendOtp("ramnagareats@gmail.com");
    const code = await devCode("ramnagareats@gmail.com");
    const verified = await verifyOtp("ramnagareats@gmail.com", code, "CUSTOMER");
    check("customer-web: sign-in works (finds CUSTOMER)", verified.status === 200 && verified.body?.user?.role === "CUSTOMER" && verified.body?.isNew === false);
  }

  // rider-web (role: RIDER) → finds RIDER
  {
    await sendOtp("ramnagareats@gmail.com");
    const code = await devCode("ramnagareats@gmail.com");
    const verified = await verifyOtp("ramnagareats@gmail.com", code, "RIDER");
    check("rider-web: sign-in works (finds RIDER)", verified.status === 200 && verified.body?.user?.role === "RIDER" && verified.body?.isNew === false);
  }

  // ── Scenario 7: New email — sign up on any app ──
  console.log("\n📋 Scenario 7: New email — sign up on all 3 apps");
  const testEmail = `testall_${Date.now()}@test.test`;

  // Register CUSTOMER
  const custResult = await signInOrRegister(testEmail, "NewCustomer", "CUSTOMER");
  check("new email: CUSTOMER registration", custResult.isNew === true && custResult.user?.role === "CUSTOMER");

  // Register RIDER (same email)
  const riderResult = await signInOrRegister(testEmail, "NewRider", "RIDER");
  check("new email: RIDER registration (same email)", riderResult.isNew === true && riderResult.user?.role === "RIDER");

  // Register RESTAURANT (same email, no role → backend finds CUSTOMER → but register with RESTAURANT)
  {
    await sendOtp(testEmail);
    const code = await devCode(testEmail);
    const verified = await verifyOtp(testEmail, code); // no role
    // Finds CUSTOMER account → returns it
    check("new email: restaurant-web finds CUSTOMER (no role)", verified.status === 200 && verified.body?.user?.role === "CUSTOMER" && verified.body?.isNew === false);
  }

  // Sign in as RESTAURANT (role: RESTAURANT) → isNew
  {
    await sendOtp(testEmail);
    const code = await devCode(testEmail);
    const verified = await verifyOtp(testEmail, code, "RESTAURANT");
    check("new email: restaurant role returns isNew", verified.status === 200 && verified.body?.isNew === true);
  }

  // ── Scenario 8: Duplicate registration ──
  console.log("\n📋 Scenario 8: Duplicate registration prevention");
  {
    await sendOtp(testEmail);
    const code = await devCode(testEmail);
    const verified = await verifyOtp(testEmail, code, "CUSTOMER");
    // CUSTOMER already exists → should return existing user, not isNew
    check("duplicate: CUSTOMER login returns existing user", verified.status === 200 && verified.body?.isNew === false && verified.body?.user?.role === "CUSTOMER");
  }
  {
    await sendOtp(testEmail);
    const code = await devCode(testEmail);
    const verified = await verifyOtp(testEmail, code, "RIDER");
    // RIDER already exists → should return existing user
    check("duplicate: RIDER login returns existing user", verified.status === 200 && verified.body?.isNew === false && verified.body?.user?.role === "RIDER");
  }

  // ── Summary ──
  console.log("\n" + "═".repeat(60));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log("\n❌ Failures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  console.log();
}

main().catch(console.error);
