/**
 * Browser walkthrough of the full customer → restaurant flow.
 * Drives a real browser (Edge) against the running apps.
 *
 * Usage: node scripts/browser-walk.mjs
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const CUSTOMER_URL = "http://localhost:3000";
const RESTAURANT_URL = "http://localhost:3001";
const SHOTS = "data/screens";
mkdirSync(SHOTS, { recursive: true });

let passed = 0;
let failed = 0;
const failures = [];
const ok = (name, condition, detail = "") => {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const customer = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const restaurant = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const admin = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const phone = `+91${String(Math.floor(1000000000 + Math.random() * 8999999999)).slice(0, 10)}`;
const walkEmail = `walker-${Date.now()}@ramnagareats.test`;
let orderNumber = "";

async function shot(page, name) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

async function waitFor(page, selector, timeout = 15000, label = selector) {
  await page.waitForSelector(selector, { timeout, state: "visible" });
}

async function text(page, selector) {
  return (await page.textContent(selector))?.trim() ?? "";
}

async function clickByText(page, selector, searchText) {
  const handle = page.locator(selector).filter({ hasText: searchText }).first();
  await handle.click();
}

// Send an OTP and reach the code step, retrying through the 60s resend cooldown
// (fixed demo emails trip it when the walk is run back-to-back).
async function sendOtpToCodeStep(page, submitSelector, codeSelector) {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    if ((await page.locator(codeSelector).count()) > 0) break;
    if ((await page.locator(submitSelector).count()) > 0) {
      await page.click(submitSelector);
    }
    await page.waitForTimeout(5000);
  }
  await page.waitForSelector(codeSelector, { timeout: 10000, state: "visible" });
}

try {
  // ===================== RESTAURANT (parked live before the order exists) =====================
  console.log("\n[Restaurant] Email OTP login + park on live order queue");
  await restaurant.goto(`${RESTAURANT_URL}/login`, { waitUntil: "domcontentloaded" });
  await waitFor(restaurant, ".login-form .oauth-option", 15000);
  await restaurant.locator(".login-form .oauth-option").first().click(); // Continue with Email
  await waitFor(restaurant, '.login-form input[type="email"]', 10000);
  await restaurant.fill('.login-form input[type="email"]', "kitchen@ramnagareats.test");
  await sendOtpToCodeStep(restaurant, ".login-form .submit", '.login-form input[placeholder="······"]');
  const ownerCode = await fetch("http://localhost:5000/api/v1/auth/dev-otp?email=kitchen%40ramnagareats.test").then((r) => r.json());
  await restaurant.locator('.login-form input[placeholder="······"]').fill(ownerCode.code);
  await restaurant.click(".login-form .submit");
  await waitFor(restaurant, ".stats article", 15000, "dashboard");
  ok("restaurant dashboard loads stats", (await restaurant.locator(".stats article").count()) === 4);
  await shot(restaurant, "r1-dashboard");
  await restaurant.goto(`${RESTAURANT_URL}/orders`, { waitUntil: "domcontentloaded" });
  await waitFor(restaurant, ".order-queue, .empty", 15000, "order queue");
  ok("restaurant order queue is live", true);

  // ===================== CUSTOMER =====================
  console.log("\n[Customer] Home + location");
  await customer.goto(CUSTOMER_URL, { waitUntil: "domcontentloaded" });
  await waitFor(customer, ".location-sheet", 20000, "location sheet");
  ok("location sheet asks for delivery area", true);
  await customer.fill('.location-sheet input[placeholder="Home"]', "Home");
  await customer.fill('.location-sheet input[placeholder="400001"]', "400001");
  await customer.click(".location-sheet .confirm");
  await waitFor(customer, ".restaurant-card:not(.skeleton-card)", 20000, "restaurant cards");
  ok("homepage shows restaurants from the API", (await customer.locator(".restaurant-card").count()) > 0);
  ok("hero chips are dynamic (delivery time from live data)", (await text(customer, ".chip-one")).includes("min"));
  ok("hero brand name comes from server config", (await text(customer, ".eyebrow")).includes("RAMNAGAR EATS"));
  await shot(customer, "1-home");

  console.log("\n[Customer] Search filters");
  await customer.fill(".hero-search input", "biryani");
  await customer.press(".hero-search input", "Enter");
  await waitFor(customer, ".restaurant-grid .restaurant-card", 15000, "search results");
  await waitFor(customer, ".results-count", 10000);
  const searchTitles = await customer.locator(".restaurant-title-row h3").allTextContents();
  ok("search filters results", searchTitles.length > 0 && searchTitles.every((t) => t.toLowerCase().includes("biryani")), searchTitles.join(","));
  await shot(customer, "2-search");
  await customer.goto(CUSTOMER_URL, { waitUntil: "domcontentloaded" });
  await waitFor(customer, ".restaurant-card:not(.skeleton-card)", 20000);

  console.log("\n[Customer] Restaurant detail + add to cart");
  await customer.click(".restaurant-card .restaurant-link >> nth=0");
  await waitFor(customer, ".menu-item", 15000, "menu items");
  ok("restaurant detail + menu load dynamically", (await customer.locator(".menu-category").count()) > 0);
  ok("restaurant page shows call + directions actions", (await customer.locator(".restaurant-info .restaurant-action").count()) >= 1);
  await waitFor(customer, ".restaurant-map .leaflet-tile", 15000, "restaurant map tiles");
  ok("restaurant location map renders", (await customer.locator(".restaurant-map .leaflet-tile").count()) > 0);
  ok("reviews section present", (await customer.locator(".reviews-section").count()) === 1);
  await shot(customer, "3-restaurant");
  // Search within the restaurant.
  const totalItems = await customer.locator(".menu-item").count();
  await customer.fill(".menu-search input", "chicken");
  await customer.waitForTimeout(600);
  const filteredItems = await customer.locator(".menu-item").count();
  ok("dish search filters the menu", filteredItems > 0 && filteredItems < totalItems, `${filteredItems}/${totalItems}`);
  await customer.fill(".menu-search input", "");
  await customer.waitForTimeout(400);

  // Veg / Non-Veg filter tabs (dynamic filtering of the DB menu).
  const vegOnly = await customer.locator(".food-filter button").nth(1).textContent();
  ok("veg/non-veg filter tabs render", vegOnly?.includes("Veg") ?? false, vegOnly ?? "");
  await customer.locator(".food-filter button").nth(1).click();
  await customer.waitForTimeout(400);
  const vegCount = await customer.locator(".menu-item").count();
  const allVeg = await customer.locator(".menu-item .veg-badge.veg").count();
  ok("veg filter shows only vegetarian dishes", vegCount > 0 && allVeg === vegCount, `${allVeg}/${vegCount}`);
  // Category chips appear while filtered; combining filters still works.
  ok("category chips appear when filtering", (await customer.locator(".category-chips button").count()) >= 2);
  await customer.locator(".food-filter button").nth(2).click();
  await customer.waitForTimeout(400);
  const nonVegCount = await customer.locator(".menu-item").count();
  const nonVegBadges = await customer.locator(".menu-item .veg-badge.non-veg").count();
  ok("non-veg filter shows only non-veg dishes", nonVegCount > 0 && nonVegBadges === nonVegCount, `${nonVegBadges}/${nonVegCount}`);
  await customer.locator(".food-filter button").nth(0).click();
  await customer.waitForTimeout(300);
  await customer.fill(".menu-search input", "zzzz-no-match");
  await customer.waitForTimeout(500);
  ok("no-match search shows empty state with clear filters", (await customer.locator(".menu-empty .filter").count()) === 1);
  await customer.fill(".menu-search input", "");
  await customer.waitForTimeout(400);

  // Menu preview drawer from the card (bottom sheet mobile / drawer desktop).
  await customer.goto(CUSTOMER_URL, { waitUntil: "domcontentloaded" });
  await waitFor(customer, ".restaurant-card:not(.skeleton-card)", 20000);
  await customer.hover(".restaurant-card >> nth=0");
  await customer.locator(".restaurant-card .card-menu-btn >> nth=0").click();
  // Wait for the menu items, not just the drawer container: items render a beat
  // after the sheet opens (menu data fetch), so checking immediately races it.
  await waitFor(customer, ".menu-preview-item", 10000, "menu preview items");
  ok("menu icon opens the quick-menu drawer", (await customer.locator(".menu-preview-item").count()) > 0);
  ok("drawer shows filter panel", (await customer.locator(".menu-preview-filters .food-filter button").count()) === 3);
  await customer.locator(".menu-preview-filters .food-filter button").nth(1).click();
  await customer.waitForTimeout(400);
  const previewVeg = await customer.locator(".menu-preview-item .veg-badge.veg").count();
  const previewTotal = await customer.locator(".menu-preview-item").count();
  ok("drawer veg filter updates instantly", previewVeg === previewTotal && previewTotal > 0, `${previewVeg}/${previewTotal}`);
  await customer.click(".menu-preview .close");
  await customer.waitForTimeout(400);
  await customer.click(".restaurant-card .restaurant-link >> nth=0");
  await waitFor(customer, ".menu-item", 15000, "menu items");

  await customer.locator(".menu-item .add-btn").first().click();
  const customizeModal = await customer.locator(".customize-sheet").count();
  if (customizeModal > 0) {
    await customer.locator(".customize-sheet .confirm").first().click();
  }
  await waitFor(customer, ".bag b", 10000, "cart badge");
  ok("add-to-cart shows quantity badge", Number(await text(customer, ".bag b")) >= 1);
  // Bump quantity to 2 so the cart clears the coupon minimum (WELCOME20 needs ₹249+).
  await customer.locator(".menu-item .qty button").nth(1).click();
  await customer.waitForFunction(() => document.querySelector(".bag b")?.textContent === "2", { timeout: 5000 });
  ok("quantity controls update the cart", true);
  await customer.click(".bag");
  await waitFor(customer, ".cart-drawer .cart-item", 10000, "cart drawer item");
  ok("cart drawer shows the added item", true);
  await shot(customer, "4-cart-drawer");
  await customer.reload({ waitUntil: "domcontentloaded" });
  await customer.click(".bag");
  await waitFor(customer, ".cart-drawer .cart-item", 10000);
  ok("cart persists across refresh", (await customer.locator(".cart-drawer .cart-item").count()) === 1);
  await customer.click(".cart-drawer-foot a.confirm");
  await waitFor(customer, ".summary-card .confirm", 10000, "cart page");
  ok("full cart page renders", (await customer.locator(".cart-items--page .cart-item").count()) >= 1);
  await shot(customer, "5-cart-page");
  ok("free delivery progress shown below threshold", (await customer.locator(".free-delivery").count()) >= 1);
  await customer.click(".summary-card .confirm");
  await waitFor(customer, ".auth-form-card", 15000, "login redirect");
  ok("checkout requires login (redirects)", true);

  console.log("\n[Customer] Email OTP register + address");
  // Email OTP: choose email → enter address → code → new-user details. Dev code read from the API.
  await customer.locator(".auth-form-card .oauth-option").first().click(); // Continue with Email
  await waitFor(customer, '.auth-form-card input[placeholder="you@example.com"]', 10000);
  await customer.fill('.auth-form-card input[placeholder="you@example.com"]', walkEmail);
  await sendOtpToCodeStep(customer, ".auth-form-card .auth-submit", '.auth-form-card input[placeholder="······"]');
  const customerCode = await fetch(`http://localhost:5000/api/v1/auth/dev-otp?email=${encodeURIComponent(walkEmail)}`).then((r) => r.json());
  await customer.fill('.auth-form-card input[placeholder="······"]', customerCode.code);
  await customer.click(".auth-form-card .auth-submit");
  await waitFor(customer, '.auth-form-card input[placeholder="Priya Sharma"]', 10000, "registration details");
  await customer.fill('.auth-form-card input[placeholder="Priya Sharma"]', "Browser Walker");
  await customer.fill('.auth-form-card input[placeholder="9876543210"]', phone);
  await customer.click(".auth-form-card .auth-submit");
  await waitFor(customer, ".checkout-section", 15000, "checkout after register");
  ok("OTP registration returns to checkout", true);
  await waitFor(customer, ".checkout-empty-address", 15000, "address required prompt");
  ok("checkout blocks without an address", true);
  await customer.click(".checkout-empty-address a");
  await waitFor(customer, ".addresses-head", 10000, "addresses page");
  await clickByText(customer, ".addresses-head button, .empty-state button", "Add address");
  await waitFor(customer, ".location-sheet", 10000, "address form");
  await customer.fill('.location-sheet input[placeholder="Flat, building, street, area"]', "42 Marine Drive, Ramnagar Eats Hub");
  await customer.fill('.location-sheet input[placeholder="400001"]', "400001");
  await customer.click(".location-sheet .confirm");
  await waitFor(customer, ".address-card", 15000, "saved address card");
  ok("address saved", true);
  await customer.goBack();
  await waitFor(customer, ".address-option", 15000, "checkout address option");
  ok("checkout shows saved address", true);
  await shot(customer, "6-checkout");

  console.log("\n[Customer] Coupon + place order");
  await waitFor(customer, ".coupon-rack", 10000, "coupon rack");
  ok("coupon rack shows available coupons", (await customer.locator(".coupon-rack button").count()) > 0);
  await customer.fill(".coupon-input input", "WELCOME20");
  await customer.click(".coupon-input button");
  await waitFor(customer, ".coupon-applied", 10000, "coupon applied");
  ok("coupon validated by backend and applied", (await text(customer, ".coupon-applied")).includes("WELCOME20"));
  await customer.fill(".order-note textarea", "Less spicy please");
  await customer.click(".payment-option >> nth=0"); // COD
  await customer.click(".summary-card .confirm");
  await waitFor(customer, ".success-hero", 20000, "order success");
  const successText = await text(customer, ".success-hero");
  const match = successText.match(/RE-\d+/);
  orderNumber = match ? match[0] : "";
  ok("order confirmation shows order id", Boolean(orderNumber), successText);
  const pageText = await text(customer, "body");
  ok("confirmation shows restaurant + payment", pageText.includes("Cash on Delivery"), pageText.slice(0, 200));
  await shot(customer, "7-order-success");

  console.log("\n[Restaurant] New order arrives in real time");
  // The restaurant page has been sitting on /orders the whole time — the order must
  // appear without any navigation or reload, pushed over the socket.
  await restaurant.waitForSelector(".toast", { state: "visible", timeout: 10000 });
  ok("restaurant shows NEW ORDER toast in real time", (await text(restaurant, ".toast")).includes("New order received"));
  await restaurant.waitForFunction(
    (num) => [...document.querySelectorAll(".order-tile")].some((tile) => tile.textContent.includes(num)),
    orderNumber,
    { timeout: 15000 }
  );
  ok("new order tile appears live without refresh", true);
  ok("restaurant order tile shows customer phone for calling", (await restaurant.locator(".order-tile").filter({ hasText: orderNumber }).locator(".order-tile-call").count()) >= 1);
  await shot(restaurant, "r2-new-order");

  console.log("\n[Customer] Track order with live route map");
  await customer.click(".success-actions .confirm");
  await waitFor(customer, ".tracking-map .leaflet-tile", 20000, "route map tiles");
  ok("tracking page shows live route map", (await customer.locator(".tracking-map .leaflet-tile").count()) > 0);
  ok("route map shows restaurant + home markers", (await customer.locator(".tracking-map .leaflet-marker-icon").count()) >= 2);
  ok("dynamic ETA badge shown", (await text(customer, ".route-eta-badge")).includes("Arriving"));
  const helpButtons = await customer.locator(".order-help-btn").count();
  ok("call + directions buttons on tracking page", helpButtons >= 2 && (await customer.locator(".order-help-btn[href^='tel:']").count()) >= 1);
  await shot(customer, "7b-route-map");
  await customer.goto(CUSTOMER_URL, { waitUntil: "domcontentloaded" });
  await waitFor(customer, ".footer", 10000, "footer");
  ok("site footer renders with links", (await customer.locator(".footer-links a").count()) >= 3);

  console.log("\n[Customer] Profile");
  await customer.goto(`${CUSTOMER_URL}/profile`, { waitUntil: "domcontentloaded" });
  try {
    await waitFor(customer, ".profile-card", 15000, "profile");
  } catch (err) {
    console.log("  [debug] profile url:", customer.url());
    console.log("  [debug] profile body:", (await customer.locator("body").innerText()).slice(0, 250).replace(/\n+/g, " | "));
    await shot(customer, "debug-profile-fail");
    throw err;
  }
  ok("profile page shows account info", (await text(customer, ".profile-card")).includes("Browser Walker"));
  // Avatar upload: pick a small PNG through the file input, expect the server
  // to accept it and the profile to display it (local provider in dev).
  const avatarInput = customer.locator(".profile-section .image-uploader input[type=file]");
  if ((await avatarInput.count()) > 0) {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
    await avatarInput.setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer: png });
    await waitFor(customer, ".profile-avatar--img", 10000, "avatar preview");
    ok("avatar upload previews and persists", (await customer.locator(".profile-avatar--img").getAttribute("src")).startsWith("http"));
    await shot(customer, "p-profile-avatar");
  }
  await shot(customer, "p-profile");

  console.log("\n[Customer] Orders + tracking");
  await customer.goto(`${CUSTOMER_URL}/orders`, { waitUntil: "domcontentloaded" });
  await waitFor(customer, ".order-card", 15000, "orders list");
  ok("orders page lists the placed order", (await text(customer, ".order-card")).includes(orderNumber));
  await customer.click(".order-card-actions a >> nth=0");
  await waitFor(customer, ".timeline", 10000, "tracking timeline");
  ok("order timeline renders (PLACED)", (await text(customer, ".status--lg")) === "Order placed");
  await waitFor(customer, ".tracking-map .leaflet-tile", 15000, "route map tiles");
  ok("tracking page route map renders", (await customer.locator(".tracking-map .leaflet-marker-icon").count()) >= 2);
  // ETA countdown is computed from server timestamps — visible while the order is active.
  const etaActive = await customer.evaluate(() => document.body.textContent.includes("Arriving in approximately") || document.body.textContent.includes("Estimated by"));
  ok("ETA countdown displayed while order is active", etaActive);
  await shot(customer, "8-tracking-placed");

  console.log("\n[Restaurant] Live status flow (no reloads)");
  const flow = [
    ["Accept order", "Accepted"],
    ["Start preparing", "Preparing"],
    ["Mark ready", "Ready"],
    ["Mark picked up", "Picked up"],
    ["Out for delivery", "Out for delivery"],
    ["Mark delivered", "Delivered"],
  ];
  for (const [action, expected] of flow) {
    const tile = restaurant.locator(".order-tile").filter({ hasText: orderNumber });
    await tile.first().waitFor({ state: "visible", timeout: 15000 });
    const button = tile.first().locator(`.action.accept:has-text("${action}")`);
    await button.click();
    await restaurant.waitForFunction(
      ({ num, expectedStatus }) =>
        [...document.querySelectorAll(".order-tile")].some(
          (tile) => tile.textContent.includes(num) && tile.querySelector(".status")?.textContent.trim() === expectedStatus
        ),
      { num: orderNumber, expectedStatus: expected },
      { timeout: 15000 }
    );
    ok(`restaurant tile updates live to ${expected}`, true);
    await shot(restaurant, `r3-${action.replaceAll(" ", "-")}`);
  }

  console.log("\n[Restaurant] Profile cover photo upload");
  await restaurant.goto(`${RESTAURANT_URL}/restaurant`, { waitUntil: "domcontentloaded" });
  await waitFor(restaurant, ".form-card .image-uploader", 10000, "profile uploader");
  const coverInput = restaurant.locator(".image-uploader input[type=file]").first();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  await coverInput.setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: png });
  await waitFor(restaurant, ".image-uploader-preview img", 10000, "cover preview");
  ok("restaurant cover upload previews", (await restaurant.locator(".image-uploader-preview img").first().getAttribute("src")).startsWith("http"));
  // Save the profile so the uploaded cover persists to the backend.
  await restaurant.click(".form-card .submit");
  await waitFor(restaurant, ".notice:has-text('Restaurant details saved')", 10000, "profile saved");
  ok("profile save persists uploaded cover", true);
  await shot(restaurant, "r4-cover-upload");

  console.log("\n[Customer] Tracking page updates live (no navigation)");
  // The customer's tracking page has been open the whole time — it must reach
  // DELIVERED purely from socket events / background polling.
  await customer.waitForFunction(() => document.querySelector(".status--lg")?.textContent?.includes("Delivered"), { timeout: 30000 });
  ok("customer tracking shows DELIVERED without reload", (await text(customer, ".status--lg")) === "Delivered");
  ok("timeline steps all completed (incl. picked-up)", (await customer.locator(".timeline li.done").count()) === 7);
  await shot(customer, "9-tracking-delivered");

  // Feedback form appears after delivery; submitting stores the rating.
  await customer.reload({ waitUntil: "domcontentloaded" });
  await waitFor(customer, ".feedback-card", 10000, "feedback form");
  ok("feedback form appears after delivery", (await customer.locator(".star-rating button").count()) === 5);
  await customer.locator(".star-rating button").nth(4).click();
  await customer.fill(".feedback-card textarea", "Excellent biryani!");
  await customer.click(".feedback-card .filter");
  await waitFor(customer, ".feedback-card--done", 10000, "feedback submitted");
  ok("rating stored after submission", (await customer.locator(".feedback-card--done").count()) === 1);
  await shot(customer, "10-feedback");

  console.log("\n[Mobile] No horizontal overflow at 390px");
  async function noOverflow(page, url, name) {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1600);
    const { overflow, culprits } = await page.evaluate(() => {
      const vw = window.innerWidth;
      const culprits = [];
      for (const el of document.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (r.right > vw + 1 && culprits.length < 6) culprits.push(`${el.tagName}.${String(el.className).split(" ")[0]}(r:${Math.round(r.right)},l:${Math.round(r.left)},w:${Math.round(r.width)})`);
      }
      return { overflow: document.documentElement.scrollWidth - vw, culprits };
    });
    ok(`mobile ${name} has no horizontal overflow`, overflow <= 1, `overflow px: ${overflow}${culprits.length ? ` — ${culprits.join(", ")}` : ""}`);
  }
  await customer.setViewportSize({ width: 390, height: 844 });
  await noOverflow(customer, `${CUSTOMER_URL}/`, "home");
  await noOverflow(customer, `${CUSTOMER_URL}/restaurants`, "restaurant listing");
  await noOverflow(customer, `${CUSTOMER_URL}/cart`, "cart");
  await noOverflow(customer, `${CUSTOMER_URL}/checkout`, "checkout");
  await noOverflow(customer, `${CUSTOMER_URL}/orders`, "orders");
  await noOverflow(customer, `${CUSTOMER_URL}/profile`, "profile");
  await noOverflow(customer, `${CUSTOMER_URL}/login`, "login");
  await restaurant.setViewportSize({ width: 390, height: 844 });
  await noOverflow(restaurant, `${RESTAURANT_URL}/orders`, "restaurant orders");
  await noOverflow(restaurant, `${RESTAURANT_URL}/menu`, "restaurant menu");
  await shot(customer, "m1-mobile-home");
  await customer.setViewportSize({ width: 1280, height: 900 });
  await restaurant.setViewportSize({ width: 1280, height: 900 });

  console.log("\n[Google] OAuth button + dev-callback round-trip");
  await customer.setViewportSize({ width: 1280, height: 900 });
  // The walker is logged in — sign out first so the Google sign-in is a fresh login.
  await customer.goto(`${CUSTOMER_URL}/`, { waitUntil: "domcontentloaded" });
  await waitFor(customer, ".account--user", 10000);
  await customer.click(".account--user");
  await customer.click('.account-menu button:has-text("Sign out")');
  await customer.waitForTimeout(1500);
  await customer.goto(`${CUSTOMER_URL}/login`, { waitUntil: "domcontentloaded" });
  await waitFor(customer, ".auth-form-card .oauth-option", 10000);
  const googleButtons = await customer.locator(".oauth-option:has-text('Google')").count();
  ok("login page offers Continue with Google", googleButtons === 1);
  // Drive the dev OAuth callback (production redirects to real Google) and let the
  // callback page exchange the token — the browser must land logged-in on /profile.
  const googleEmail = `gwalk-${Date.now()}@ramnagareats.test`;
  await customer.goto(
    `http://localhost:5000/api/v1/auth/google/dev-callback?app=customer&email=${encodeURIComponent(googleEmail)}&name=Google%20Walker`,
    { waitUntil: "domcontentloaded" }
  );
  await customer.waitForURL(/\/oauth\/callback/, { timeout: 10000 });
  // The callback page mounts asynchronously (code-split chunk) — wait until it
  // settles on the phone step or redirects away before deciding what to do next.
  await customer.waitForFunction(
    () => document.querySelector(".oauth-phone-form") !== null || !location.pathname.startsWith("/oauth"),
    { timeout: 15000 },
  );
  // New Google users get an optional phone step — complete it to reach the profile.
  const phoneStep = await customer.locator(".oauth-phone-form").count();
  if (phoneStep > 0) {
    await customer.fill('.oauth-phone-form input[placeholder="9876543210"]', `+919${String(Date.now()).slice(-8)}`);
    await customer.click(".oauth-phone-form .auth-submit");
  }
  // Customers land on home after sign-in; navigate to the profile to confirm identity.
  await customer.waitForFunction(() => !document.querySelector(".oauth-phone-form"), { timeout: 15000 });
  await customer.goto(`${CUSTOMER_URL}/profile`, { waitUntil: "domcontentloaded" });
  await waitFor(customer, ".profile-card", 10000);
  ok("Google dev-callback creates account and profile shows Google user", (await text(customer, ".profile-card")).includes("Google Walker"));
  await shot(customer, "g1-google-oauth");
  await customer.goto(`${CUSTOMER_URL}/login`, { waitUntil: "domcontentloaded" });
  await customer.waitForTimeout(2500);
  ok("logged-in user is redirected away from login", !(await customer.url()).includes("/login"));

  console.log("\n[Admin] Service area settings (email OTP login)");
  await admin.goto(`${RESTAURANT_URL}/login`, { waitUntil: "domcontentloaded" });
  await waitFor(admin, ".login-form .oauth-option", 15000);
  await admin.locator(".login-form .oauth-option").first().click(); // Continue with Email
  await waitFor(admin, '.login-form input[type="email"]', 10000);
  await admin.fill('.login-form input[type="email"]', "admin@ramnagareats.test");
  await sendOtpToCodeStep(admin, ".login-form .submit", '.login-form input[placeholder="······"]');
  const adminCode = await fetch("http://localhost:5000/api/v1/auth/dev-otp?email=admin%40ramnagareats.test").then((r) => r.json());
  await admin.locator('.login-form input[placeholder="······"]').fill(adminCode.code);
  await admin.click(".login-form .submit");
  await waitFor(admin, ".stats article", 15000, "admin dashboard");
  await admin.goto(`${RESTAURANT_URL}/admin`, { waitUntil: "domcontentloaded" });
  await waitFor(admin, ".admin-tabs", 10000, "admin tabs");
  await clickByText(admin, ".admin-tabs button", "Service area");
  await waitFor(admin, ".service-area-form", 10000, "service area form");
  const radiusInput = admin.locator('.service-area-form input[type="number"]').nth(2);
  const originalRadius = Number(await radiusInput.inputValue());
  ok("admin sees the service area settings", originalRadius > 0);
  await radiusInput.fill("12");
  await clickByText(admin, ".service-area-form button", "Save delivery area");
  await waitFor(admin, ".notice", 10000, "save notice");
  ok("admin can update the delivery radius", (await text(admin, ".notice")).includes("Delivery area updated"));
  await radiusInput.fill(String(originalRadius));
  await clickByText(admin, ".service-area-form button", "Save delivery area");
  await waitFor(admin, ".notice", 10000);
  ok("radius restored", true);
  await shot(admin, "a1-service-area");
} catch (error) {
  failed += 1;
  failures.push(`walk crashed: ${error.message}`);
  console.error("  ✗ walk crashed:", error.message);
} finally {
  await browser.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.error("Failures:");
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}
