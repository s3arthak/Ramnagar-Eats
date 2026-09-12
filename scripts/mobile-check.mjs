/**
 * Mobile viewport smoke check for customer-web.
 * Usage: node scripts/mobile-check.mjs   (customer dev server must be on :3000)
 */
import { chromium } from "playwright-core";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const URL = "http://localhost:3000";
const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 }, // iPhone 12/13/14
  { name: "small", width: 320, height: 700 },
];

const browser = await chromium.launch({ executablePath: EDGE, headless: true });

let passed = 0;
let failed = 0;
const failures = [];
const ok = (name, cond, detail = "") => {
  if (cond) { passed += 1; console.log(`  ✓ ${name}`); }
  else { failed += 1; failures.push(`${name}${detail ? ` — ${detail}` : ""}`); console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

async function checkOverflow(page, label) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return { scrollW: doc.scrollWidth, innerW: window.innerWidth, scrollH: doc.scrollHeight, innerH: window.innerHeight };
  });
  const horiz = overflow.scrollW > overflow.innerW + 1;
  ok(`${label}: no horizontal overflow`, !horiz, `scrollWidth=${overflow.scrollW} innerWidth=${overflow.innerW}`);
  return overflow;
}

async function visibleCount(page, sel) {
  return page.locator(sel).evaluateAll((els) => els.filter((e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }).length);
}

for (const vp of VIEWPORTS) {
  console.log(`\n===== ${vp.name} (${vp.width}x${vp.height}) =====`);
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  // ---- Home ----
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3000);
  await checkOverflow(page, "home");
  ok("home: bottom nav visible", await page.locator(".bottom-nav").isVisible().catch(() => false));
  const bnBox = await page.locator(".bottom-nav").boundingBox().catch(() => null);
  ok("home: bottom nav at bottom of viewport", bnBox && bnBox.y + bnBox.height <= vp.height + 2, bnBox && JSON.stringify(bnBox));
  // Close the auto location sheet if open
  if (await page.locator(".location-sheet").isVisible().catch(() => false)) {
    await page.locator(".location-sheet .close").click().catch(() => {});
    await page.waitForTimeout(500);
  }
  const catVisible = await visibleCount(page, ".cat-card");
  ok("home: category cards visible", catVisible > 0, `visible=${catVisible}`);
  const railScrollable = await page.locator(".rail-cats").evaluate((el) => getComputedStyle(el).overflowX === "auto" && el.scrollWidth > el.clientWidth);
  ok("home: category rail is a horizontal scroll container", railScrollable);
  await page.screenshot({ path: `data/screens/mobile-${vp.name}-home.png` });

  // ---- Restaurants ----
  await page.goto(`${URL}/restaurants`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await checkOverflow(page, "restaurants");
  const rCards = await visibleCount(page, ".restaurant-card");
  ok("restaurants: cards visible", rCards > 0, `visible=${rCards}`);
  await page.screenshot({ path: `data/screens/mobile-${vp.name}-restaurants.png` });

  // ---- Restaurant detail ----
  const link = page.locator(".restaurant-link").first();
  if (await link.count()) {
    const href = await link.getAttribute("href");
    await page.goto(`${URL}${href}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    await checkOverflow(page, "restaurant");
    const dishes = await visibleCount(page, ".dish-card");
    ok("restaurant: dish cards visible", dishes > 0, `visible=${dishes}`);
    const menuBtn = await page.locator(".floating-menu-btn").boundingBox().catch(() => null);
    ok("restaurant: floating menu button visible & above bottom nav", menuBtn && menuBtn.y + menuBtn.height < vp.height - 55, menuBtn && JSON.stringify(menuBtn));
    // dish card layout: photo + ADD visible
    const addVisible = await page.locator(".dish-add").first().isVisible().catch(() => false);
    ok("restaurant: ADD buttons visible", addVisible);
    await page.screenshot({ path: `data/screens/mobile-${vp.name}-restaurant.png` });

    // Open dish sheet (tap a dish photo)
    const dishPhoto = page.locator(".dish-photo").first();
    if (await dishPhoto.count()) {
      await dishPhoto.click().catch(() => {});
      await page.waitForTimeout(800);
      const sheet = await page.locator(".dish-sheet").isVisible().catch(() => false);
      ok("restaurant: dish sheet opens on tap", sheet);
      if (sheet) {
        const sBox = await page.locator(".dish-sheet").boundingBox();
        ok("restaurant: dish sheet fits within viewport", sBox && sBox.height <= vp.height + 2 && sBox.y >= 0, sBox && JSON.stringify(sBox));
        await page.screenshot({ path: `data/screens/mobile-${vp.name}-dish-sheet.png` });
      }
    }
  }

  // ---- Orders (requires auth → expect redirect to login, just check no overflow) ----
  await page.goto(`${URL}/orders`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await checkOverflow(page, "orders/login");

  const realErrors = errors.filter((e) => !/favicon/i.test(e));
  ok(`${vp.name}: no console errors`, realErrors.length === 0, realErrors.slice(0, 4).join(" | "));
  await page.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) console.log("Failures:\n" + failures.map((f) => "  - " + f).join("\n"));
await browser.close();
process.exit(failed > 0 ? 1 : 0);