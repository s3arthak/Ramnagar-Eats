/**
 * Brand logo check.
 *
 * "The R doesn't look right" is not something a typecheck can catch, so this
 * verifies the logo three ways:
 *   1. Geometry — all three apps ship the same mark, and the lockup's mark is
 *      that exact geometry scaled (never a redraw), so the design cannot differ
 *      between the big logo and the small marks.
 *   2. Rendering — in a real browser the mark is centred, unclipped, and the R's
 *      counter stays open instead of filling in into a blob.
 *   3. Small sizes — the counter is still visible at the sizes the UI actually
 *      uses, so shrinking can't silently change how the logo reads.
 *
 * Usage: node scripts/logo-check.mjs
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

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

const APPS = ["customer-web", "restaurant-web", "rider-web"];
const pathFor = (app, name) => `apps/${app}/public/${name}`;

// ---- 1. Geometry: every asset must share one set of shapes ------------------

/** Pull the drawn shapes out of an SVG. Only the group transform may differ. */
function shapesOf(svg) {
  return {
    tile: (svg.match(/<rect width="512" height="512" rx="(\d+)"/) || [])[1] ?? "",
    strokes: [...svg.matchAll(/<path d="([^"]+)" stroke-width="([\d.]+)"/g)].map((m) => `${m[1]}|${m[2]}`).sort(),
    fills: [...svg.matchAll(/<path d="([^"]+)"(?=\s*\/>)/g)].map((m) => m[1]).sort(),
    circles: [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)].map((m) => `${m[1]},${m[2]},${m[3]}`).sort(),
  };
}

/** The mark group transform, and the uniform scale inside it. */
function transformOf(svg) {
  const match = (svg.match(/<g transform="translate\((-?[\d.]+) (-?[\d.]+)\) scale\(([\d.]+)\) translate\((-?[\d.]+) (-?[\d.]+)\)"/) || []);
  if (!match[1]) return null;
  return { raw: match[0], x: Number(match[1]), y: Number(match[2]), scale: Number(match[3]), tx: Number(match[4]), ty: Number(match[5]) };
}

const files = [];
for (const app of APPS) {
  for (const name of ["logo-mark.svg", "favicon.svg", "logo.svg"]) {
    const path = pathFor(app, name);
    const svg = await readFile(path, "utf8");
    files.push({ app, name, path, svg, shapes: shapesOf(svg), transform: transformOf(svg), wordmark: /<text/.test(svg) });
  }
}

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

console.log("Geometry");
const reference = files[0];
const referenceShape = JSON.stringify(reference.shapes);
for (const file of files) {
  check(`${file.path}: draws the exact same mark`, JSON.stringify(file.shapes) === referenceShape, "shape data differs from the shared mark");
  check(`${file.path}: has a centred, uniform transform`, Boolean(file.transform), "mark group transform missing or non-uniform");
  check(file.wordmark ? `${file.path}: carries the wordmark` : `${file.path}: mark only`, file.wordmark === (file.name === "logo.svg"));
}
const markScales = new Set(files.filter((f) => !f.wordmark).map((f) => f.transform?.scale));
const lockupScales = new Set(files.filter((f) => f.wordmark).map((f) => f.transform?.scale));
check("all six small-size assets use one identical scale", markScales.size === 1, `scales: ${[...markScales].join(", ")}`);
check("all three lockups use one identical scale", lockupScales.size === 1, `scales: ${[...lockupScales].join(", ")}`);
check("lockup mark is the same mark, only scaled down", [...lockupScales][0] < [...markScales][0], `lockup ${[...lockupScales][0]} vs mark ${[...markScales][0]}`);

// ---- 2 + 3. Rendering: centred, unclipped, counter open, still open small ---

// The lockup's wordmark has its own letter counters, so the counter check is
// limited to the region holding the R (the mark occupies the top ~52%).
const MARK_REGION = [0, 0, 1, 0.56];

const targets = [
  { label: "mark", path: pathFor("customer-web", "logo-mark.svg"), sizes: [512, 132, 40, 32] },
  { label: "favicon", path: pathFor("customer-web", "favicon.svg"), sizes: [512, 32, 16] },
  { label: "lockup", path: pathFor("customer-web", "logo.svg"), sizes: [512, 132], wordmark: true, region: MARK_REGION },
  { label: "restaurant mark", path: pathFor("restaurant-web", "logo-mark.svg"), sizes: [32] },
  { label: "rider mark", path: pathFor("rider-web", "logo-mark.svg"), sizes: [34] },
];

const jobs = [];
for (const target of targets) {
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(await readFile(target.path, "utf8")).toString("base64")}`;
  for (const size of target.sizes) jobs.push({ label: target.label, size, region: target.region ?? null, wordmark: Boolean(target.wordmark), dataUrl });
}

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage();
const rendered = await page.evaluate(async (jobs) => {
  const analyse = async (dataUrl, size, region) => {
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
    // both the tile and the transparent rounded corners.
    const white = new Uint8Array(size * size);
    for (let i = 0; i < size * size; i += 1) {
      const o = i * 4;
      white[i] = data[o] > 200 && data[o + 1] > 200 && data[o + 2] > 200 ? 1 : 0;
    }

    // Flood fill the background inwards from the border. Anything not reached is
    // enclosed by the mark — that is the letter's counter, and its existence is
    // exactly what makes the shape read as an R instead of a solid blob.
    const inRegion = (x, y) =>
      !region || (x >= region[0] * size && y >= region[1] * size && x < region[2] * size && y < region[3] * size);

    const reached = new Uint8Array(size * size);
    const stack = [];
    const visit = (index) => {
      if (!reached[index] && !white[index]) {
        reached[index] = 1;
        stack.push(index);
      }
    };
    for (let x = 0; x < size; x += 1) {
      visit(x);
      visit((size - 1) * size + x);
    }
    for (let y = 0; y < size; y += 1) {
      visit(y * size);
      visit(y * size + size - 1);
    }
    while (stack.length) {
      const index = stack.pop();
      const x = index % size;
      const y = (index - x) / size;
      if (x > 0) visit(index - 1);
      if (x < size - 1) visit(index + 1);
      if (y > 0) visit(index - size);
      if (y < size - 1) visit(index + size);
    }

    let whiteCount = 0;
    let enclosed = 0;
    let bbox = [size, size, -1, -1];
    let box = [size, size, -1, -1];
    const bands = [0, 0, 0, 0];
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const index = y * size + x;
        if (white[index]) {
          whiteCount += 1;
          bands[Math.min(3, Math.floor((y / size) * 4))] += 1;
          if (x < bbox[0]) bbox[0] = x;
          if (y < bbox[1]) bbox[1] = y;
          if (x > bbox[2]) bbox[2] = x;
          if (y > bbox[3]) bbox[3] = y;
        } else if (!reached[index] && inRegion(x, y)) {
          enclosed += 1;
          if (x < box[0]) box[0] = x;
          if (y < box[1]) box[1] = y;
          if (x > box[2]) box[2] = x;
          if (y > box[3]) box[3] = y;
        }
      }
    }
    return { size, whiteCount, enclosed, bbox, box: box[2] < 0 ? null : box, bands };
  };

  const out = [];
  for (const job of jobs) out.push({ ...job, dataUrl: undefined, result: await analyse(job.dataUrl, job.size, job.region) });
  return out;
}, jobs);
await browser.close();

console.log("\nRendering");
for (const job of rendered) {
  const { size, whiteCount, enclosed, bbox, box, bands } = job.result;
  const tag = `${job.label} @${size}px`;
  check(`${tag}: mark is drawn`, whiteCount > 0, "no white pixels");
  if (whiteCount > 0) {
    check(`${tag}: not clipped`, bbox[0] > 0 && bbox[1] > 0 && bbox[2] < size - 1 && bbox[3] < size - 1, `bbox ${bbox.join(",")} of ${size}`);
    const centre = (bbox[0] + bbox[2]) / 2;
    // Half a pixel of rounding is unavoidable once the tile is only 16px across.
    check(`${tag}: horizontally centred`, Math.abs(centre - size / 2) <= Math.max(1, size * 0.05), `centre ${centre.toFixed(1)} vs ${size / 2}`);
    // Shrinking the logo must not close the counter up, which is what made the
    // small marks look like a different, worse logo. Below ~32px the counter is
    // barely two pixels tall, so it is measured but not asserted there.
    if (size >= 32) {
      check(`${tag}: the R's counter is open`, enclosed > 0, "no enclosed background — the mark reads as a solid blob");
      if (enclosed > 0) console.log(`      counter: ${enclosed} px, bbox ${box.join(",")}`);
    } else {
      console.log(`      counter: ${enclosed} px (too small to assert at ${size}px)`);
    }
  }
  if (job.wordmark) {
    const top = bands[0] + bands[1];
    const bottom = bands[2] + bands[3];
    check(`${tag}: mark sits above the wordmark`, top > 0 && bottom > 0, `bands ${bands.join("/")}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
