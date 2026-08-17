/**
 * Read-only backup of the production Atlas database (db from MONGODB_URI in
 * backend/.env). Dumps every collection to data/backup-atlas-<timestamp>/ as
 * JSON. Run BEFORE any destructive production reseed.
 *
 * Usage: npm run backup --workspace=backend
 */
import "dotenv/config";
import mongoose from "mongoose";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

async function main() {
  const uri = process.env.MONGODB_URI ?? "";
  if (!uri) {
    console.error("MONGODB_URI is not set in backend/.env — refusing to guess.");
    process.exit(1);
  }
  const isAtlas = uri.includes("mongodb+srv");
  if (!isAtlas) {
    console.error("MONGODB_URI does not look like the Atlas cluster (mongodb+srv). Refusing to back up a local DB with the prod script.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dir = path.resolve(process.cwd(), "../data/backup-atlas-" + stamp);
  await mkdir(dir, { recursive: true });

  let total = 0;
  for (const { name } of collections) {
    const docs = await db.collection(name).find({}).limit(50_000).toArray();
    await writeFile(path.join(dir, `${name}.json`), JSON.stringify(docs, null, 1));
    total += docs.length;
    console.log(`  ${name}: ${docs.length} docs`);
  }
  console.log(`Backup complete → data/backup-atlas-${stamp} (${total} docs total)`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("Backup failed:", error);
  process.exit(1);
});
