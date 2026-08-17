# Ramnagar Eats — Agent Working Agreement

Rules for any AI agent (or human) working on this repository. Read before changing code.

---

## 1. Do this, every time

### Before you push anything
1. **Typecheck the backend:** `npm run typecheck --workspace=backend`
2. **Run the full API suite:** `npm run test:api --workspace=backend` — all tests must pass (164+).
3. **Build every workspace:** `npm run build` (typechecks + builds all three workspaces).
4. **Run the browser walk** whenever frontend behavior changed: `node scripts/browser-walk.mjs` (requires the full local stack: MongoDB on :27017, API on :5000, customer on :3000, restaurant on :3001). It must pass 76/76.
5. **Re-seed the local DB** with `npm run seed --workspace=backend` when seed data changed, and restart the backend so in-memory config (service center, radius) matches the new `.env`.
6. **Test every service you touched** — auth, orders, restaurants, locations, mail, uploads — not just the happy path. Use the real-browser probes in `data/` (`probe-location2.mjs`, `probe-rest-picker.mjs`) and `scripts/browser-walk.mjs`.

### Git hygiene
7. **Never commit local files:** `.env`, `data/`, `backend/uploads/`, `*.log`, `dist/` are all gitignored — never `git add -f` them.
8. **Never push secrets.** Check `git status` before every commit; if `.env` or a key appears staged, stop.
9. **Commit in multiple logical commits**, not one giant commit. Message style: `perf:`, `fix:`, `feat:`, `docs:`, `test:` prefix, one intent per commit.
10. **Never push directly without verifying** the working tree is otherwise clean of unrelated edits.

### Environment discipline
11. **Any new env var** must be added to ALL of: `.env.example`, `.env.production.example`, `render.yaml` (production var list), and `docs/PROJECT.md` (env table). Missing one = broken deployment.
12. **Renaming an env var** (e.g. `OTP_PROVIDER` → `OTP_DELIVERY`): grep the whole repo for the old name — code, tests, scripts, docs, CI, `render.yaml` — before considering it done.
12b. **Render caps env vars at 20 per service** — never add a 21st key to the Render dashboard env; drop a redundant one (e.g. the `SERVICE_CENTER_*`/`SERVICE_RADIUS_KM` vars are redundant — the DB service area is authoritative). Env changes need a redeploy: push a commit (auto-deploy) — API-triggered deploys can fail with `update_failed`.
13. **Production data (MongoDB Atlas):** only ever change it after a backup (`cd backend && npx tsx scripts/backup-atlas.ts`). Use the `--restaurants-only` seed mode for catalog changes; never wipe users/orders with a full reseed against production.
14. **`backend/.env` targets the production Atlas cluster** — never run a plain `npm run dev:backend` or the seed against it unless you intend to touch production. Use `MONGODB_URI=mongodb://127.0.0.1:27017/ramnagar-eats` for local work.

### The delivery area
15. **The service area is Ramnagar, Jammu** — center `32.80674, 75.314854`, radius 15 km, pincode 182122. It lives in MongoDB (admin-editable) and in seed/env defaults. Never reintroduce the old Mumbai defaults (`19.076, 72.8777`).

---

## 2. Don't do this

- **Don't run the seed, browser walk, or API tests against the production Atlas URI.** Local work uses `127.0.0.1`.
- **Don't skip the browser walk** when UI, routing, lazy-loading, or the location sheet changed — unit tests do not catch overlay/z-index/placeholder issues.
- **Don't change the map stack** — the app is on **OpenStreetMap + Leaflet** with emoji `divIcon` markers (no marker-image assets). No Mapbox GL.
- **Don't add heavy dependencies** (state libraries, animation libraries, UI frameworks, notification SaaS) without a written justification in the commit message.
- **Don't let the frontend decide order state** — the server is the authority for statuses, prices, coupons, roles, and the delivery-radius rule.
- **Don't commit `node_modules`, `dist`, `data/`, `.env*`** — ever.
- **Don't send test OTPs from the live server repeatedly** — each attempt hits Brevo/SMTP and the resend cooldown; one verification send is enough.
- **Don't leave stale docs** — when docs change, remove the old file if it's superseded and update README links.

---

## 3. Stack & commands cheat-sheet

| Task | Command |
| --- | --- |
| Install | `npm install` |
| Local stack | MongoDB (`data/mongo-walk` on :27017) + `npm run dev:backend` (:5000) + `npm run dev:customer` (:3000) + `npm run dev:restaurant` (:3001) |
| Seed local | `npm run seed --workspace=backend` (with `MONGODB_URI` pointed at local) |
| Seed catalog only (prod-safe) | `cd backend && npx tsx src/seed.ts --restaurants-only` |
| Back up Atlas | `cd backend && npx tsx scripts/backup-atlas.ts` |
| Verify Atlas data | `cd backend && npx tsx scripts/verify-atlas.ts` |
| API tests | `npm run test:api --workspace=backend` |
| Typecheck | `npm run typecheck --workspace=backend` |
| Build all | `npm run build` |
| Browser E2E | `node scripts/browser-walk.mjs` (76 checks) |
| Docs | `docs/PROJECT.md` (everything), `docs/BACKLOG.md` (roadmap), this file (rules) |

## 4. Live environment

- Customer web: `https://ramnagar-eats-customer.vercel.app`
- Restaurant web: `https://ramnagar-eats-restaurant.vercel.app`
- API: `https://ramnagar-eats-api.onrender.com/api/v1`
- MongoDB: Atlas cluster `cluster0`, db `ramnagar-eats` (URI in `backend/.env`)
- **Render auto-deploys on push to `main`** (repo-connected). **Vercel does NOT** (no Git integration) — deploy manually with the CLI from the repo root: `npx vercel deploy --prod --yes --token $VERCEL_TOKEN` (the root `.vercel/project.json` must name the target project). **Verify the live apps after any deploy** (`node data/probe-live.mjs`).
