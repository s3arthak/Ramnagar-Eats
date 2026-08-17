# Ramnagar Eats — Project Reference

The complete, current description of the platform: architecture, file structure, tech stack,
data model, API, environment variables, and deployment. Companion docs: `CLAUDE.md` (agent
working rules) and `docs/BACKLOG.md` (roadmap).

---

## 1. What this is

A hyperlocal food-delivery platform for **one delivery area: Ramnagar, Jammu** (center
`32.80674, 75.314854`, radius 15 km, pincode 182122). Three apps:

| App | Stack | Local URL | Live URL |
| --- | --- | --- | --- |
| Customer web | React 19 + Vite + Leaflet | http://localhost:3000 | https://ramnagar-eats-customer.vercel.app |
| Restaurant partner web (incl. admin) | React 19 + Vite + Leaflet | http://localhost:3001 | https://ramnagar-eats-restaurant.vercel.app |
| API + Socket.IO | Node 24 + Express + MongoDB | http://localhost:5000 | https://ramnagar-eats-api.onrender.com |

MongoDB runs on **Atlas** in production (cluster `cluster0`, db `ramnagar-eats`) and locally on
a bundled `mongod` (or Docker `mongo:8`). The API is the single source of truth — the frontends
never decide order state, prices, coupons, roles, or delivery-area rules.

---

## 2. Architecture

```text
Customer Web (React) ─┐
                      ├── HTTPS REST /api/v1 + Socket.IO (ws) ──► Express API ──► MongoDB (Atlas)
Restaurant Web (React)┘                                                    │
     (partner dashboard + admin panel)                                     ├─ Email (Brevo SMTP / API)
                                                                           ├─ ImageKit CDN (uploads)
                                                                           └─ Mapbox Directions (optional, geodesic fallback)
```

- **Auth:** email OTP (no passwords) + Google OAuth. Roles: `CUSTOMER`, `RESTAURANT`, `ADMIN`.
- **Real-time:** Socket.IO (`order:new` → restaurant, `order:updated` → customer + restaurant) with light polling fallback.
- **Maps:** OpenStreetMap tiles + Leaflet, emoji `divIcon` markers (no image assets), lazy-loaded per page.
- **Order flow:** `PLACED → ACCEPTED → PREPARING → READY → PICKED_UP → OUT_FOR_DELIVERY → DELIVERED` (server-enforced state machine) + `CANCELLED`.
- **Payment:** COD + a mock gateway behind an interface (drop-in for Razorpay/Stripe).

---

## 3. File structure

```text
.
├── CLAUDE.md                      # Agent working rules (test/commit/env discipline)
├── README.md                      # Quick start
├── docs/
│   ├── PROJECT.md                 # This file
│   └── BACKLOG.md                 # Roadmap (optimization + UI + features)
├── .env.example                   # Full dev env template (tracked)
├── .env.production.example        # Full prod env template (tracked)
├── render.yaml                    # Render blueprint (API service + env var list)
├── docker-compose.yml             # Prod-style stack (mongo + api + both webs)
├── docker-compose.dev.yml         # Hot-reload override
├── docker/                        # Dockerfiles + nginx configs
├── scripts/
│   └── browser-walk.mjs           # 76-check real-browser E2E (Edge)
├── backend/
│   ├── package.json               # Workspace: api (Node 24, tsx dev, tsc build)
│   ├── .env                       # LOCAL env (gitignored; points at Atlas — careful!)
│   ├── src/
│   │   ├── server.ts              # Entry: http + socket.io + graceful shutdown
│   │   ├── app.ts                 # Express app: helmet, CORS, rate limits, routes
│   │   ├── config.ts              # Central config from env (center, radius, fees, otp)
│   │   ├── seed.ts                # Seed: 12 Ramnagar restaurants, menus, coupons, users
│   │   ├── middleware/auth.ts     # JWT auth + role authorization
│   │   ├── models/                # Mongoose: User, Restaurant, Menu, Order, Address,
│   │   │                          #   Coupon, Feedback, Otp, ServiceArea
│   │   ├── modules/
│   │   │   ├── auth/              # send-otp, verify-otp, register, me, logout, google
│   │   │   ├── orders/            # create (server-verified), list, detail, cancel
│   │   │   ├── restaurants/       # public list (geo-indexed), detail, menu, reviews
│   │   │   ├── restaurant/        # owner: queue, status, dashboard, profile, menu CRUD
│   │   │   ├── admin/             # metrics, restaurants, users, orders, service-area, coupons
│   │   │   ├── locations/         # serviceability, reverse-geocode (Nominatim + cache)
│   │   │   ├── config/            # GET /config (display config)
│   │   │   ├── uploads/           # image upload (ImageKit or local provider)
│   │   │   └── users/             # addresses
│   │   ├── services/
│   │   │   ├── email.ts           # console / SMTP / Brevo providers + branded HTML
│   │   │   ├── otp.ts             # code gen, hashing, expiry, cooldown, lockout
│   │   │   ├── order-status.ts    # state machine + email notifications
│   │   │   ├── payment.ts         # COD + MockPayment behind an interface
│   │   │   ├── routing.ts         # Mapbox Directions → geodesic fallback
│   │   │   ├── images.ts          # ImageKit provider / local provider
│   │   │   └── service-area.ts    # delivery-area source of truth (admin-editable)
│   │   ├── sockets/index.ts       # JWT-authed Socket.IO events
│   │   └── utils/                 # errors, geo, password, availability, logger (req-id)
│   └── scripts/
│       ├── api-test.ts            # 164 end-to-end API tests (in-memory MongoDB)
│       ├── backup-atlas.ts        # Read-only production backup → data/backup-atlas-*
│       └── verify-atlas.ts        # Read-only production data verification
├── apps/
│   ├── customer-web/              # React 19 + Vite (customer storefront)
│   │   ├── src/pages/             # Route-lazy pages (React.lazy + Suspense)
│   │   ├── src/components/        # LocationSheet, LocationMap (lazy Leaflet chunk), Layout
│   │   ├── src/context/           # Auth, Location, Toast, Cart
│   │   ├── src/lib/               # api client, config, types, format
│   │   └── vercel.json            # SPA rewrites
│   └── restaurant-web/            # React 19 + Vite (partner dashboard + admin)
│       ├── src/pages/             # Orders, Menu, Restaurant (LocationPicker), Admin, Dashboard
│       ├── src/components/        # Shell, LocationPicker + LocationPickerMap (lazy Leaflet)
│       └── vercel.json            # SPA rewrites
└── shared/                        # Shared types/constants (if any)
```

---

## 4. Tech stack

| Layer | Choice |
| --- | --- |
| Runtime | Node.js 24, TypeScript 6 (strict) |
| API | Express 5, Zod validation, helmet, express-rate-limit |
| DB | MongoDB (Atlas prod), Mongoose, `2dsphere` geo index on restaurants |
| Real-time | Socket.IO (JWT handshake) |
| Frontend | React 19, Vite 8, React Router 7, TanStack Query, lucide-react icons |
| Maps | Leaflet + react-leaflet v5 + OpenStreetMap tiles, emoji divIcon markers, lazy chunks |
| Email | NodeMailer (Brevo SMTP relay) or Brevo REST API; console fallback in dev |
| Uploads | ImageKit CDN (prod) or local `/uploads` (dev) |
| Auth | Email OTP (hashed codes, expiry, lockout, cooldown) + Google OAuth |
| CI | GitHub Actions: typecheck + build + API tests |
| Deploy | Render (API, from `render.yaml`) + Vercel (both web apps) + Atlas (MongoDB) |

---

## 5. Data model (collections)

- **users** — name, phone, email, role, avatar, googleId; OTP-only (no usable password).
- **restaurants** — ownerId, name, cuisines, `location: {type:"Point", coordinates:[lng,lat]}` (2dsphere), rating/ratingCount, delivery time window, priceForTwo, open/accepting flags, hours, offers, isActive.
- **menucategories / menuitems** — per-restaurant menu; items have price, image, isVeg, availability, popularity, prepTime, customizations.
- **orders** — customerId, restaurantId, item snapshots (name/price at order time), address snapshot, fees, coupon, payment, status history, idempotencyKey.
- **addresses** — per-customer saved addresses with lat/lng.
- **coupons** — code, type (PERCENT/FLAT), min order, max discount, optional restaurantIds.
- **feedbacks** — orderId, restaurantId, rating (1–5), comment.
- **otps** — email, hashed code, attempts, expiresAt (unique per email; TTL cleanup).
- **serviceareas** — single `key:"default"` doc: center, radiusKm, address, pincode (admin-editable, live).

---

## 6. API reference

Base: `/api/v1`. Success: `{success, message?, data?}` · Error: `{success:false, message, code}`.
Auth: `Authorization: Bearer <token>`.

### Auth (public unless marked)
| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/auth/send-otp` | Send email OTP (cooldown-guarded) |
| POST | `/auth/verify-otp` | Verify code → session token |
| POST | `/auth/register` | Create account after OTP verification |
| POST | `/auth/logout` · GET `/auth/me` (auth) | Session |
| GET | `/auth/dev-otp?email=` | **dev/E2E only — 404 in production** |
| GET | `/auth/google/*` | Google OAuth start + dev callback (dev only) |

### Discovery (public)
| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/restaurants` | List/search; geo-radius gated via `lat`/`lng` (DB `$geoWithin`), filters (q, cuisines, rating, veg, deliveryTime, price), sorts, pagination |
| GET | `/restaurants/:id` · `/restaurants/:id/menu` · `/restaurants/:id/reviews` | Detail, menu, reviews (per-star aggregation) |
| GET | `/categories` · `/config` | Cuisine categories · display config (center, radius, fees) |
| GET | `/locations/serviceability?lat=&lng=` | Inside the delivery area? (server-authoritative) |
| POST | `/locations/reverse-geocode` | Nominatim reverse geocode (validated, cached, graceful 502) |
| GET | `/coupons?restaurantId=` (auth) | Coupons usable by the logged-in user |

### Orders & addresses (auth — CUSTOMER)
| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/orders` | Create order — server re-verifies prices/availability/area/coupon; idempotency key |
| GET | `/orders` · `/orders/:id` | My orders / detail |
| PATCH | `/orders/:id/cancel` | Cancel while allowed |
| GET/POST | `/users/addresses` · PATCH/DELETE `/users/addresses/:id` | Saved addresses |

### Restaurant owner (auth — RESTAURANT)
| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/restaurant/orders` · PATCH `/restaurant/orders/:id/status` | Live queue · validated status transitions |
| PATCH | `/restaurant/status` · GET `/restaurant/dashboard` | Open/close · today's stats |
| GET/PUT | `/restaurants/me` | Profile (incl. `location` lat/lng from the map picker) |
| GET/POST | `/restaurants/me/categories` · PATCH/DELETE `/:id` | Menu categories |
| GET/POST | `/restaurants/me/menu-items` · PATCH/DELETE `/:id` · PATCH `/:id/availability` | Menu items |

### Admin (auth — ADMIN)
| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/admin/metrics` · `/admin/restaurants` · `/admin/users` · `/admin/orders` | Oversight |
| PATCH | `/admin/restaurants/:id` | Approve/disable |
| GET/PATCH | `/admin/service-area` | Delivery center + radius (live) |
| GET/POST | `/admin/coupons` · PATCH/DELETE `/:id` | Coupon CRUD |

### Real-time (Socket.IO, same origin as API, JWT handshake)
| Event | Direction | Payload |
| --- | --- | --- |
| `order:new` | backend → restaurant | New order (toast + live queue) |
| `order:updated` | backend → customer & restaurant | Status changed (live timeline) |

---

## 7. Environment variables

Dev template: `.env.example` · Prod template: `.env.production.example` · Render list: `render.yaml`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | 5000 | API port |
| `MONGODB_URI` | local | MongoDB (prod: Atlas `mongodb+srv://…`) |
| `JWT_SECRET` | dev-only fallback | Session signing (**required** in prod) |
| `SERVICE_CENTER_LAT/LNG` | 32.80674 / 75.314854 | Delivery center (Ramnagar, Jammu) |
| `SERVICE_RADIUS_KM` | 15 | Initial delivery radius (admin-editable) |
| `BASE_DELIVERY_FEE` / `DELIVERY_FEE_FREE_ABOVE` | 20 / 499 | Fees |
| `CURRENCY_SYMBOL` / `ORDER_PREFIX` / `BRAND_NAME` / `PHONE_COUNTRY_CODE` | ₹ / RE- / Ramnagar Eats / 91 | Display |
| `OTP_DELIVERY` | console | `console` (log) · `smtp` (NodeMailer relay) · `brevo` (REST) |
| `EMAIL_FROM` | — | **Verified sender** (e.g. `Ramnagar Eats <ramnagareats@gmail.com>`) |
| `SMTP_HOST/PORT/USER/PASS` | — | Brevo SMTP relay (`smtp-relay.brevo.com:587`) |
| `BREVO_API_KEY` | — | Brevo REST alternative |
| `OTP_TTL_MS` / `OTP_MAX_ATTEMPTS` / `OTP_RESEND_COOLDOWN_MS` | 300000 / 5 / 60000 | OTP security |
| `CORS_ORIGINS` | localhost:3000,3001 | Allowed browser origins (comma-separated) |
| `RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_MAX` | 300 / 10 | API / auth rate limits |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | — | Google OAuth |
| `IMAGEKIT_PUBLIC_KEY` / `IMAGEKIT_PRIVATE_KEY` / `IMAGEKIT_URL_ENDPOINT` | — | Upload CDN (falls back to local `/uploads`) |
| `MAPBOX_ACCESS_TOKEN` | — | Optional road-route polylines (geodesic fallback) |
| `PUBLIC_API_URL` / `CUSTOMER_WEB_URL` / `RESTAURANT_WEB_URL` | localhost | Email links / OAuth redirects |
| Vite: `VITE_API_URL` | http://localhost:5000/api/v1 | Frontend API base (prod: `https://ramnagar-eats-api.onrender.com/api/v1`) |

> Rules: every new var goes into `.env.example` + `.env.production.example` + `render.yaml` + this table.
> `.env` files are gitignored; only the templates and `render.yaml` are committed.

---

## 8. Local development

```bash
npm install
cp .env.example .env            # point MONGODB_URI at your local MongoDB
npm run seed --workspace=backend   # 12 restaurants around Ramnagar, menus, coupons, demo accounts
# three terminals:
npm run dev:backend             # :5000
npm run dev:customer            # :3000
npm run dev:restaurant          # :3001
```

Demo accounts (OTP login — code in the API log or `GET /auth/dev-otp?email=…`):
- Admin: `admin@ramnagareats.test`
- Restaurant owner: `kitchen@ramnagareats.test`
- Customer: `demo@ramnagareats.test`

**Never run the seed/dev against the Atlas URI in `backend/.env` by accident** — prefix local commands with `MONGODB_URI=mongodb://127.0.0.1:27017/ramnagar-eats`.

Docker (prod-style): `cp .env.production.example .env.production` (set `JWT_SECRET`, `CORS_ORIGINS`, …) then `docker compose --env-file .env.production up --build -d`.

---

## 9. Testing

| Suite | Command | What it covers |
| --- | --- | --- |
| API acceptance | `npm run test:api --workspace=backend` | 164 E2E tests, in-memory MongoDB, no Docker: OTP security matrix, service-area rules, order state machine, ownership boundaries, coupons, tampering, idempotency, sockets |
| Typecheck | `npm run typecheck --workspace=backend` | Strict TS |
| Build | `npm run build` | Typechecks + builds all workspaces |
| Browser E2E | `node scripts/browser-walk.mjs` | 76 checks in real Edge: full order flow, real-time, maps, OAuth, admin, mobile overflow |
| Location probes | `node data/probe-location2.mjs` · `node data/probe-rest-picker.mjs` | GPS happy path / out-of-area / permission-denied; restaurant picker save |
| CI | GitHub Actions (`.github/workflows/ci.yml`) | typecheck + build + API tests on every push |

---

## 10. Deployment

### MongoDB Atlas (already live)
Cluster `cluster0`, db `ramnagar-eats`, user `kharkasarthak_db_user`. Network access allows the API. **Back up before any production data change:** `cd backend && npx tsx scripts/backup-atlas.ts`. Reseed only the catalog with `npx tsx src/seed.ts --restaurants-only` (never wipes users/orders).

### Render — API
Service **ramnagar-eats-api** (`https://ramnagar-eats-api.onrender.com`), repo-connected with `render.yaml` (root `backend`, build `npm ci && npm run build`, start `node dist/server.js`, health `/api/v1/health`). Env vars live in the dashboard (not committed): `MONGODB_URI`, `JWT_SECRET`, `OTP_DELIVERY=smtp`, `SMTP_*`, `EMAIL_FROM` (verified sender), `CORS_ORIGINS` (both Vercel domains), `IMAGEKIT_*`, Google OAuth creds, and the display/fee vars from `.env.production.example`. Free tier sleeps — first request after idle takes ~30–60 s.

**Ops notes (learned the hard way):**
- Render **caps env vars at 20 per service** — extra keys in a PUT are silently dropped. The service-area vars (`SERVICE_CENTER_*`, `SERVICE_RADIUS_KM`) are intentionally NOT in the Render env: the runtime reads the delivery area from MongoDB, and code defaults are Ramnagar anyway.
- Env-var changes do **not** auto-deploy; and **API-triggered deploys (`POST /v1/services/{id}/deploys`) can fail with `update_failed`** for no exposed reason — pushing a commit to `main` triggers the reliable auto-deploy instead.
- Env vars can be managed via the Render API: `GET/PUT /v1/services/{serviceId}/env-vars` (full replacement, raw JSON array body).

### Vercel — both web apps
Projects **ramnagar-eats-customer** and **ramnagar-eats-restaurant**, root `apps/customer-web` / `apps/restaurant-web`, build `npm ci && npm run build`, output `dist`, `vercel.json` SPA rewrites. Env var: `VITE_API_URL=https://ramnagar-eats-api.onrender.com/api/v1`.

**Ops notes:** the projects are **not connected to GitHub** (no auto-deploy on push). Deploy from the repo root with the Vercel CLI (the projects' `rootDirectory` setting points at each app, and both apps import `shared/` assets):
```bash
# .vercel/project.json at the repo root must name the target project, then:
npx vercel deploy --prod --yes --token $VERCEL_TOKEN
```
(`rootDirectory` on the project must remain `apps/customer-web` / `apps/restaurant-web` for this to resolve.) Connecting the GitHub integration in the Vercel dashboard restores push-to-deploy.

### After deploying
1. `GET /api/v1/health` → `{"status":"ok","database":"connected"}`.
2. `GET /api/v1/config` shows Ramnagar center + 15 km.
3. `GET /api/v1/locations/serviceability?lat=32.80674&lng=75.314854` → serviceable.
4. Send one OTP to a real inbox and confirm delivery (sender must be verified in Brevo).
5. `node data/probe-live.mjs` → all checks pass against the live URLs.
6. Google OAuth prod callback URI must be registered in the Google Cloud console.

---

## 11. Key design decisions

- **OTP only, no passwords** — email OTP + Google; `EmailService` abstraction leaves room for password recovery.
- **Server is the authority** — prices, discounts, coupons, roles, order state, and the delivery-radius rule are always recomputed/enforced server-side.
- **Admin-driven delivery area** — center + radius live in MongoDB and change without a redeploy.
- **Order item snapshots** — menu changes never rewrite order history.
- **Provider abstractions** — email (console/SMTP/Brevo), payments (COD/mock), images (local/ImageKit), routing (Mapbox/geodesic) are interfaces; real providers drop in without touching business logic.
- **Latency discipline** — restaurant listing is geo-indexed (`$geoWithin` on `2dsphere`), projections limit fields, compound indexes serve the hot order queries, request IDs make every slow request traceable (`req=<id>`, `user=<id>` in logs).
- **Bounded email timeouts** — SMTP/Brevo fail in ≤15 s so OTP requests never hang.
- **Maps on OpenStreetMap/Leaflet** with emoji markers and lazy-loaded chunks — no image assets, no paid map dependency.
