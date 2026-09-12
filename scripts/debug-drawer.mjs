import { chromium } from "playwright-core";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const URL = "http://localhost:3000";

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
// set location if the sheet is open
if (await page.locator(".location-sheet").isVisible().catch(() => false)) {
  await page.fill('.location-sheet input[placeholder="Home"]', "Home");
  await page.fill('.location-sheet input[placeholder="182122"]', "182122");
  await page.click(".location-sheet .confirm");
  await page.waitForTimeout(2500);
}
await page.hover(".restaurant-card >> nth=0");
await page.locator(".restaurant-card .card-menu-btn >> nth=0").click();
await page.waitForTimeout(1500); // let the drawer animation settle

const drawer = page.locator(".menu-preview");
const drawerBox = await drawer.boundingBox();
console.log("drawer box:", JSON.stringify(drawerBox));
const styles = await drawer.evaluate((el) => {
  const s = getComputedStyle(el);
  return { position: s.position, top: s.top, right: s.right, bottom: s.bottom, left: s.left, width: s.width, height: s.height, margin: s.margin, maxHeight: s.maxHeight, transform: s.transform };
});
console.log("drawer styles:", JSON.stringify(styles));
const overlayStyles = await page.locator(".overlay.menu-preview-overlay").evaluate((el) => {
  const s = getComputedStyle(el);
  const matched = [];
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (rule.selectorText && el.matches(rule.selectorText)) {
          matched.push(`${rule.selectorText} { ${rule.style.cssText} }`);
        }
      }
    } catch {}
  }
  return { display: s.display, placeItems: s.placeItems, position: s.position, width: s.width, height: s.height, top: s.top, left: s.left, insetBlock: s.insetBlock, matched: matched.slice(0, 10) };
});
console.log("overlay styles:", JSON.stringify(overlayStyles, null, 1));
const btn = page.locator(".menu-preview-filters .food-filter button").nth(1);
const btnBox = await btn.boundingBox();
console.log("filter btn box:", JSON.stringify(btnBox));
// what element is at the button's center?
const hit = await page.evaluate(([x, y]) => {
  const el = document.elementFromPoint(x, y);
  return el ? `${el.tagName}.${String(el.className).slice(0, 60)}` : "none";
}, [btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2]);
console.log("element at btn center:", hit);
// is the drawer animating?
const anim = await drawer.evaluate((el) => getComputedStyle(el).animationName + " " + getComputedStyle(el).animationDuration);
console.log("drawer animation:", anim);
// scroll positions
const scroll = await page.evaluate(() => ({ y: window.scrollY, docH: document.documentElement.scrollHeight, innerH: window.innerHeight }));
console.log("page scroll:", JSON.stringify(scroll));
await page.screenshot({ path: "data/screens/debug-drawer.png" });
await browser.close();