/**
 * Runtime check: Google-only login + animated location sheet.
 * Usage: node scripts/auth-loc-check.mjs  (customer dev on :3000, backend on :5000)
 */
import { chromium } from "playwright-core";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const URL = "http://localhost:3000";

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

let passed = 0;
let failed = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { passed += 1; console.log(`  ✓ ${name}`); }
  else { failed += 1; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

// ---- Location sheet (auto-opens on home when no place) ----
console.log("== Location sheet ==");
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2500);
ok("location sheet auto-opens", await page.locator(".location-sheet").isVisible().catch(() => false));
ok("animated radar hero renders", (await page.locator(".loc-radar").count()) === 1);
ok("prominent GPS CTA renders", (await page.locator(".gps--cta").count()) === 1);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
ok("no horizontal overflow with sheet open", overflow);
await page.screenshot({ path: "data/screens/auth-loc-sheet.png" });
await page.locator(".location-sheet .close").click().catch(() => {});
await page.waitForTimeout(400);

// ---- Login page (Google only) ----
console.log("== Login page ==");
await page.goto(`${URL}/login`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
ok("login card renders", (await page.locator(".auth-form-card").count()) === 1);
ok("Continue with Google is the primary CTA", (await page.locator(".oauth-option--google").count()) === 1);
ok("no 'Continue with Email' button", (await page.locator(".oauth-option--email").count()) === 0);
const bodyText = await page.locator("body").innerText();
ok("'same flow, one code.' text removed", !bodyText.includes("same flow, one code."));
ok("Create an account link present", bodyText.includes("Create an account"));
await page.screenshot({ path: "data/screens/auth-login.png" });

// ---- Create-account flow via the link ----
await page.locator(".auth-switch button").first().click();
await page.waitForTimeout(400);
ok("create-account form opens", (await page.locator('input[placeholder="you@example.com"]').count()) === 1);
ok("create-account header says NEW HERE", (await page.locator("text=NEW HERE").count()) > 0);
await page.screenshot({ path: "data/screens/auth-create.png" });

// ---- needsAccount route (Google found no account) ----
console.log("== needsAccount popup ==");
await page.goto(`${URL}/login?needsAccount=1&googleId=dev-google-abc&gemail=newuser%40gmail.com&gname=New%20User`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
ok("needsAccount opens create-account directly", (await page.locator('input[placeholder="you@example.com"]').count()) === 1);
ok("explains account not found", (await page.locator("text=create an account for").count()) > 0 || (await page.locator("text=account for").count()) > 0);
await page.screenshot({ path: "data/screens/auth-needs-account.png" });

// ---- Mobile login (320) ----
console.log("== Mobile login 320px ==");
await page.setViewportSize({ width: 320, height: 700 });
await page.goto(`${URL}/login`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
const mo = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
ok("no horizontal overflow on login", mo.sw <= mo.iw + 1, `sw=${mo.sw} iw=${mo.iw}`);
const gBtn = await page.locator(".oauth-option--google").boundingBox();
ok("Google button fits in viewport", gBtn && gBtn.x >= 0 && gBtn.x + gBtn.width <= 320, gBtn && JSON.stringify(gBtn));
await page.screenshot({ path: "data/screens/auth-login-mobile.png" });

console.log(`\n${passed} passed, ${failed} failed`);
await browser.close();
process.exit(failed > 0 ? 1 : 0);