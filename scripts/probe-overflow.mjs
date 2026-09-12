import { chromium } from "playwright-core";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const URL = "http://localhost:3000";

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 320, height: 700 } });

for (const path of ["/", "/restaurants"]) {
  await page.goto(`${URL}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  if (path === "/" && (await page.locator(".location-sheet").isVisible().catch(() => false))) {
    await page.locator(".location-sheet .close").click().catch(() => {});
    await page.waitForTimeout(500);
  }
  const offenders = await page.evaluate(() => {
    const vw = window.innerWidth;
    const out = [];
    for (const el of document.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > vw + 1) {
        const style = getComputedStyle(el);
        out.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className && typeof el.className === "string") ? el.className.slice(0, 60) : "",
          right: Math.round(r.right),
          width: Math.round(r.width),
          pos: style.position,
          overflowX: style.overflowX,
          overflowY: style.overflowY,
          display: style.display,
          text: (el.textContent || "").trim().slice(0, 30),
        });
      }
    }
    return out.slice(0, 25);
  });
  console.log(`\n== ${path} (${page.evaluate(() => document.documentElement.scrollWidth)} scrollW) offenders:`);
  for (const o of offenders) {
    console.log(`  ${o.tag}.${o.cls} right=${o.right} w=${o.width} pos=${o.pos} ox=${o.overflowX} oy=${o.overflowY} disp=${o.display} "${o.text}"`);
  }
}

await browser.close();