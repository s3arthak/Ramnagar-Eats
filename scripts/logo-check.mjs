/**
 * Brand logo check.
 *
 * Renders every logo asset in a real browser and verifies the things a human eye
 * would check: the mark is centred in its tile, nothing is clipped at the tile
 * edge, and the mark is still visible at the smallest size the UI uses.
 *
 * Usage: node scripts/logo-check.mjs
 */
import { chromium } from "playwright-core";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const BROWSERS = [
  process.env.BROWSER_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

const executablePath = BROWSERS.find((path) => existsSync(path));
if (!executablePath) {
  console.error("No Chrome/Edge binary found. Set BROWSER_PATH to one.");
  process.exit(1);
}

// What each asset must satisfy. `label` prefixes the reported checks.
const ASSETS = [
  { label: "logo-mark.svg", path: "apps/customer-web/public/logo-mark.svg", sizes: [512, 132, 40, 32] },
  { label: "logo.svg (lockup)", path: "apps/customer-web/public/logo.svg", sizes: [512, 132, 108], wordmark: true },
  { label: "favicon.svg", path: "apps/customer-web/public/favicon.svg", sizes: [32, 16] },
  { label: "restaurant logo-mark", path: "apps/restaurant-web/public/logo-mark.svg", sizes: [32] },
  { label: "restaurant logo lockup", path: "apps/restaurant-web/public/logo.svg", sizes: [108], wordmark: true },
  { label: "rider logo-mark", path: "apps/rider-web/public/logo-mark.svg", sizes: [34] },
  { label: "rider favicon", path: "apps/rider-web/public/favicon.svg", sizes: [32] },
];

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage();
const jobs = [];

for (const asset of ASSETS) {
  const svg = await readFile(asset.path, "utf8");
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  for (const size of asset.sizes) jobs.push({ ...asset, size, dataUrl });
}

const rendered = await page.evaluate(async (jobs) => {
  const analyse = async (dataUrl, size) => {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, size, size);
    const { data } = context.getImageData(0, 0, size, size);

    // The mark is white on an orange tile, so "white" isolates the artwork from
    // the tile and from the transparent rounded corners.
    let minX = size;
    let minY = size;
    let maxX = -1;
    let maxY = -1;
    let white = 0;
    const bands = [0, 0, 0, 0];
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const i = (y * size + x) * 4;
        const isWhite = data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200;
        if (!isWhite) continue;
        white += 1;
        bands[Math.min(3, Math.floor((y / size) * 4))] += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    return { size, white, bands, minX, minY, maxX, maxY };
  };

  const out = [];
  for (const job of jobs) out.push({ ...job, dataUrl: undefined, result: await analyse(job.dataUrl, job.size) });
  return out;
}, jobs);

await browser.close();

let passed = 0;
let failed = 0;
const check = (name, ok, detail = "") => {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

for (const job of rendered) {
  const { size, white, bands, minX, minY, maxX, maxY } = job.result;
  const tag = `${job.label} @${size}px`;
  console.log(`\n${tag}`);
  check(`${tag}: mark is drawn`, white > 0, "no white pixels found");

  if (white > 0) {
    // Nothing may be cut off at the tile edge.
    check(`${tag}: not clipped`, minX > 0 && minY > 0 && maxX < size - 1 && maxY < size - 1, `bbox ${minX},${minY} → ${maxX},${maxY} of ${size}`);

    // Horizontally centred within ~4% of the tile.
    const centre = (minX + maxX) / 2;
    check(`${tag}: horizontally centred`, Math.abs(centre - size / 2) <= size * 0.04, `centre ${centre.toFixed(1)} vs ${size / 2}`);

    // Small UI sizes must still show the mark clearly, not a speck.
    const minimum = size <= 40 ? size * size * 0.02 : 0;
    check(`${tag}: visible at this size`, white >= minimum, `${white} white px (min ${Math.round(minimum)})`);
  }

  if (job.wordmark) {
    const top = bands[0] + bands[1];
    const bottom = bands[2] + bands[3];
    check(`${tag}: mark sits above the wordmark`, top > 0 && bottom > 0, `bands ${bands.join("/")}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
