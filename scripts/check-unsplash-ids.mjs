// Verify every Unsplash photo ID used in backend/src/seed.ts resolves to an image.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const seed = readFileSync(join(process.cwd(), "backend", "src", "seed.ts"), "utf8");
const ids = [...new Set([...seed.matchAll(/U\("([0-9a-z-]+)"\)/g)].map((m) => m[1]))];
console.log(`${ids.length} unique photo IDs in seed.ts`);

for (const id of ids) {
  const url = `https://images.unsplash.com/photo-${id}?w=400&q=70&auto=format&fit=crop`;
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    const type = res.headers.get("content-type") ?? "";
    if (res.status !== 200 || !type.startsWith("image/")) {
      console.log(`BROKEN ${id}: ${res.status} ${type}`);
    } else {
      console.log(`ok     ${id}: ${type}`);
    }
  } catch (err) {
    console.log(`ERROR  ${id}: ${err.message}`);
  }
}