import { chromium } from "playwright-core";

const EDGE_PATH = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = "https://ramnagar-eats-rider.vercel.app";

async function run() {
  const browser = await chromium.launch({ executablePath: EDGE_PATH, headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const logs = [];
  page.on("console", (msg) => logs.push(`[console.${msg.type()}] ${msg.text()}`));
  page.on("requestfailed", (req) => logs.push(`[network-failed] ${req.url()} — ${req.failure()?.errorText}`));

  try {
    // Step 1: OTP flow
    console.log("=== Step 1: Test OTP flow ===");
    await page.goto(BASE + "/login", { waitUntil: "networkidle", timeout: 15000 });
    await page.screenshot({ path: "scripts/screenshots/01-login.png" });

    // Re-query elements after fresh navigation
    await page.fill('input[type="email"]', "kharkasarthak@gmail.com");
    await page.screenshot({ path: "scripts/screenshots/02-email-filled.png" });

    // Click Send Code
    await page.click(".btn-primary");
    await page.waitForTimeout(5000);
    await page.screenshot({ path: "scripts/screenshots/03-after-send-code.png" });

    const bodyText = await page.textContent("body");
    console.log("After Send Code - page contains 'Code sent':", bodyText.includes("Code sent"));
    console.log("After Send Code - page contains '6-digit code':", bodyText.includes("6-digit code"));
    console.log("After Send Code - page contains 'change':", bodyText.includes("change"));
    console.log("After Send Code - page contains 'error':", bodyText.toLowerCase().includes("error"));
    console.log("URL:", page.url());

    // Step 2: Check dashboard route (should redirect to login)
    console.log("\n=== Step 2: Check / route ===");
    await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 15000 });
    await page.screenshot({ path: "scripts/screenshots/04-dashboard.png" });
    console.log("URL:", page.url());
    const dashText = await page.textContent("body");
    console.log("Contains 'Dashboard':", dashText.includes("Dashboard"));
    console.log("Contains 'Login':", dashText.includes("Login") || dashText.includes("Rider Login"));

    // Step 3: Check setup route
    console.log("\n=== Step 3: Check /setup route ===");
    await page.goto(BASE + "/setup", { waitUntil: "networkidle", timeout: 15000 });
    await page.screenshot({ path: "scripts/screenshots/05-setup.png" });
    console.log("URL:", page.url());

    // Step 4: Google OAuth redirect (capture the full redirect URL)
    console.log("\n=== Step 4: Google OAuth redirect ===");
    await page.goto(BASE + "/login", { waitUntil: "networkidle", timeout: 15000 });
    await page.click(".login-google-btn");
    await page.waitForTimeout(5000);
    await page.screenshot({ path: "scripts/screenshots/06-google-signin.png" });
    const googleUrl = page.url();
    console.log("Redirected to Google:", googleUrl.includes("accounts.google.com"));

    // Parse state from the URL to verify app=rider
    const url = new URL(googleUrl);
    const state = url.searchParams.get("state");
    if (state) {
      const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
      console.log("OAuth state:", decoded);
      console.log("app=rider in state:", decoded.app === "rider");
    }

    // Print relevant logs
    console.log("\n=== Relevant console/network logs ===");
    const relevant = logs.filter(l => l.includes("error") || l.includes("failed") || l.includes("ERR_") || l.includes("401") || l.includes("403") || l.includes("500"));
    if (relevant.length) {
      relevant.forEach(e => console.log("  ", e));
    } else {
      console.log("  No errors found ✅");
    }

  } catch (err) {
    console.error("Script error:", err.message);
    await page.screenshot({ path: "scripts/screenshots/error.png" }).catch(() => {});
  } finally {
    await browser.close();
  }
}

run();
