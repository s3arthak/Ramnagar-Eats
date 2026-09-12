/**
 * Quick smoke check for the redesigned customer-web UI.
 * Usage: node scripts/ui-check.mjs   (customer dev server must be on :3000)
 */
import { chromium } from "playwright-core";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const URL = "http://localhost:3000";

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const errors = [];
const failedReqs = [];
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
page.on("requestfailed", (req) => failedReqs.push(`${req.url()} (${req.failure()?.errorText})`));
page.on("response", (res) => {
  if (res.status() >= 400) failedReqs.push(`${res.status()} ${res.url()}`);
});

let passed = 0;
let failed = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { passed += 1; console.log(`  ✓ ${name}`); }
  else { failed += 1; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

console.log("== Home page ==");
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(3500); // let data load

ok("home-hero renders", (await page.locator(".home-hero").count()) === 1);
ok("location button renders", (await page.locator(".home-loc").count()) === 1);
const catCards = await page.locator(".cat-card").count();
ok("category rail renders", catCards > 0, `got ${catCards}`);
const bannerCount = await page.locator(".banner-slide").count();
ok("banner carousel renders", bannerCount > 0, `got ${bannerCount}`);
ok("bottom nav renders", (await page.locator(".bottom-nav").count()) === 1);
const bnLabels = await page.locator(".bottom-nav a, .bottom-nav button").allTextContents();
console.log(`  bottom nav items: ${bnLabels.join(" | ")}`);

// Open location sheet (auto-opens on first visit when no place is set),
// set a delivery location, confirm home loads restaurants
console.log("== Set location ==");
let sheetVisible = await page.locator(".location-sheet").first().isVisible().catch(() => false);
if (!sheetVisible) {
  await page.locator(".home-loc").click();
  await page.waitForTimeout(600);
  sheetVisible = await page.locator(".location-sheet").first().isVisible().catch(() => false);
}
ok("location sheet opens", sheetVisible);
if (sheetVisible) {
  const sheet = page.locator(".location-sheet").first();
  await sheet.locator("input[placeholder='Home']").fill("Home");
  await sheet.locator("input[placeholder='182122']").fill("182122");
  const saveBtn = sheet.locator("button.confirm").first();
  if (await saveBtn.count()) {
    const disabled = await saveBtn.isDisabled();
    await saveBtn.click();
    await page.waitForTimeout(4000);
    const rails = await page.locator(".rail-restaurants .restaurant-card").count();
    const emptyState = await page.locator(".state-view").count();
    ok("restaurants rail loads after location", rails > 0, `rails=${rails} emptyState=${emptyState} disabled=${disabled}`);
  } else {
    console.error("  (no .confirm button found in sheet)");
  }
}

console.log("== Restaurants page ==");
await page.goto(`${URL}/restaurants`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
ok("restaurants page renders cards", (await page.locator(".restaurant-card").count()) > 0);

console.log("== Restaurant detail ==");
const firstCard = page.locator(".restaurant-card .restaurant-link").first();
if (await firstCard.count()) {
  const href = await firstCard.getAttribute("href");
  await page.goto(`${URL}${href}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  ok("restaurant hero renders", (await page.locator(".restaurant-hero").count()) === 1);
  ok("menu toolbar renders", (await page.locator(".menu-toolbar").count()) === 1);
  const dishes = await page.locator(".dish-card").count();
  ok("dish cards render", dishes > 0, `got ${dishes}`);
  ok("floating MENU button renders", (await page.locator(".floating-menu-btn").count()) === 1);
  // ADD button on first dish
  const addBtn = page.locator(".dish-add").first();
  if (await addBtn.count()) {
    await addBtn.click();
    await page.waitForTimeout(800);
    ok("cart badge updates", (await page.locator(".bn-count").count()) > 0 || (await page.locator(".cart-count, .cart-badge").count()) > 0);
  }
}

await page.screenshot({ path: "data/screens/ui-check-home.png" });

console.log("== Issues ==");
const realErrors = errors.filter((e) => !/favicon|net::ERR/i.test(e));
ok("no console errors", realErrors.length === 0, realErrors.slice(0, 5).join(" | "));
const badReqs = failedReqs.filter((r) => !/favicon/.test(r));
ok("no failed requests", badReqs.length === 0, badReqs.slice(0, 8).join(" | "));

console.log(`\n${passed} passed, ${failed} failed`);
await browser.close();
process.exit(failed > 0 ? 1 : 0);