# Ramnagar Eats — Documentation

A hyperlocal food-delivery platform (one configured service area, default 10 km). Two web apps (customer + restaurant, with an admin panel inside the restaurant app) share one Express + MongoDB API with real-time order updates.

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend (both apps) | React 19, TypeScript, Vite, React Router, TanStack Query, Leaflet + OpenStreetMap |
| Styling | Plain CSS with shared design tokens (no UI framework dependency) |
| Backend | Node.js, Express 5, TypeScript |
| Database | MongoDB + Mongoose 9 (GeoJSON `2dsphere` index) |
| Realtime | Socket.IO (JWT-authenticated) |
| Auth | Phone OTP (scrypt-hashed codes, JWT sessions) — no passwords |
| Security | Helmet, express-rate-limit, Zod validation, CORS allowlist, RBAC |
| Email | Internal `EmailService` abstraction (console provider in dev; swappable for Resend/Brevo/Mailgun) |
| Testing | In-memory MongoDB end-to-end API suite + Playwright/Edge browser walk |
| Infra | Docker Compose (optional; see below), nginx static serving per web app |

---

## Architecture

```
┌─────────────────────┐      ┌─────────────────────┐
│  Customer Web :3000 │      │ Restaurant Web :3001 │
│  (browse/order/track)│      │ (orders/menu/admin)  │
└──────────┬──────────┘      └──────────┬──────────┘
           │ REST + WebSocket           │ REST + WebSocket
           ▼                            ▼
        ┌──────────────────────────────────────┐
        │        Backend API :5000             │
        │  Express + Socket.IO + Mongoose      │
        │  modules: auth, restaurants, menu,   │
        │  orders, coupons, locations, users,  │
        │  restaurant (owner), admin, config   │
        │  services: otp, email, coupon,       │
        │  payment (COD/Mock), service-area    │
        └───────────────┬──────────────────────┘
                        ▼
                 MongoDB :27017
```

Monorepo layout:

```
├── apps/
│   ├── customer-web/      # customer app (port 3000)
│   └── restaurant-web/    # restaurant + admin app (port 3001)
├── backend/               # Express + Socket.IO API (port 5000)
│   └── src/
│       ├── modules/       # auth, restaurants, orders, coupons, admin, ...
│       ├── models/        # User, Restaurant, Menu, Order, Coupon, Address, Otp, ServiceArea
│       ├── services/      # otp, email, payment, coupon, service-area, order-status
│       ├── sockets/       # JWT-authenticated Socket.IO setup
│       └── utils/         # errors, password, phone, geo, order-dto, logger
├── docker/                # production Dockerfiles + nginx configs
├── scripts/               # browser-walk.mjs (E2E)
└── docs/
```

---

## Services & URLs

### Currently running (this dev machine — all native, no Docker)

| Service | URL | Status |
| --- | --- | --- |
| Customer web (Vite dev) | http://localhost:3000 | ✅ running |
| Restaurant web (Vite dev) | http://localhost:3001 | ✅ running |
| Backend API + Socket.IO | http://localhost:5000 | ✅ running |
| API health check | http://localhost:5000/api/v1/health | ✅ `{"status":"ok","database":"connected"}` |
| MongoDB | mongodb://localhost:27017/ramnagar-eats | ✅ running (local `mongod` binary) |

> **Docker: not running on this machine** — `docker` is not installed here. The production Docker setup exists and works on any machine with Docker (see "Docker" below); this dev box runs MongoDB from a locally installed `mongod` binary and the apps via `npm run dev`.

### App routes

**Customer web (`:3000`):** `/` home · `/restaurants` listing · `/restaurant/:id` detail/menu · `/cart` · `/checkout` · `/addresses` · `/orders` · `/orders/:id` tracking · `/order/:id/success` · `/profile` · `/login`

**Restaurant web (`:3001`):** `/login` · `/dashboard` · `/orders` · `/menu` · `/restaurant` (profile) · `/admin` (admin panel)

---

## Authentication (phone + OTP, no passwords)

1. `POST /auth/send-otp` with a phone → a 6-digit code is sent (dev: printed to the API log; also readable from `GET /auth/dev-otp?phone=...` which is compiled out in production).
2. `POST /auth/verify-otp` with phone + code →
   - existing user: returns `{ token, user }` (session)
   - new number: returns `{ regToken, isNew: true }` (10-minute, phone-bound token)
3. `POST /auth/register` with `{ phone, regToken, name, email?, role? }` → creates the account (role defaults to CUSTOMER; RESTAURANT allowed; ADMIN impossible from the client).

Session: bearer JWT (7 days). `GET /auth/me` rehydrates on refresh; `POST /auth/logout` clears it.

**Demo accounts (seeded):**

| Role | Phone |
| --- | --- |
| Admin | `+919876500002` |
| Restaurant owner (Biryani Blues) | `+919876500001` |
| Customer | `+919876500000` |

---

## API Reference

Base URL: `http://localhost:5000/api/v1` · All responses: `{ success, ... }` / `{ success: false, message, code }`

### Auth (public unless noted)
| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/auth/send-otp` | Send a login code to a phone |
| POST | `/auth/verify-otp` | Verify the code → session token or registration token |
| POST | `/auth/register` | Create the account after OTP verification |
| POST | `/auth/logout` | End the session (auth) |
| GET | `/auth/me` | Current user (auth) |
| GET | `/auth/dev-otp?phone=` | Read last code — **dev/E2E only, disabled in production** |

### Discovery (public)
| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/restaurants` | List/search with filters (cuisine, rating, veg, delivery time, price), sort, pagination, distance + radius gating via `lat`/`lng` |
| GET | `/restaurants/:id` | Restaurant detail |
| GET | `/restaurants/:id/menu` | Menu grouped by category with customizations |
| GET | `/categories` | Cuisine categories |
| GET | `/locations/serviceability?lat=&lng=` | Is this point inside the delivery area? |
| GET | `/config` | Display-only config (delivery fee, free-delivery threshold, radius) |
| GET | `/coupons?restaurantId=` | Coupons usable by the logged-in user (auth) |

### Orders (auth — CUSTOMER)
| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/orders` | Create an order (server re-verifies prices/availability/area/coupon; idempotency key prevents duplicates) |
| GET | `/orders` | My orders |
| GET | `/orders/:id` | Order detail (customer, owning restaurant, or admin) |
| PATCH | `/orders/:id/cancel` | Cancel while allowed |

### Addresses (auth — CUSTOMER)
| Method | Path | Purpose |
| --- | --- | --- |
| GET / POST | `/users/addresses` | List / create addresses (label, address, pincode, city, state, locality, lat/lng, instructions, default) |
| PATCH / DELETE | `/users/addresses/:id` | Update / delete an address |

### Restaurant owner (auth — RESTAURANT)
| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/restaurant/orders` | This restaurant's order queue (with customer names) |
| PATCH | `/restaurant/orders/:id/status` | Advance status (validated state machine) |
| PATCH | `/restaurant/status` | Open/close toggle |
| GET | `/restaurant/dashboard` | Today's stats |
| GET/PUT | `/restaurants/me` | Read/update own profile |
| GET/POST | `/restaurants/me/categories` | List/create menu categories |
| PATCH/DELETE | `/restaurants/me/categories/:id` | Update/delete a category |
| GET/POST | `/restaurants/me/menu-items` | List/create menu items |
| PATCH | `/restaurants/me/menu-items/:id` | Update an item (price, image, description, veg, popular) |
| PATCH | `/restaurants/me/menu-items/:id/availability` | Enable/disable an item |
| DELETE | `/restaurants/me/menu-items/:id` | Delete an item |

### Admin (auth — ADMIN)
| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/admin/metrics` | Total/today/active orders, restaurants, customers, revenue |
| GET | `/admin/restaurants` | All restaurants with owners |
| PATCH | `/admin/restaurants/:id` | Approve/disable a restaurant |
| GET | `/admin/users` | All customers + owners |
| GET | `/admin/orders` · `/admin/orders/:id` | All orders / order detail |
| GET | `/admin/service-area` | Current delivery area (center + radius) |
| PATCH | `/admin/service-area` | Update delivery center/radius (takes effect immediately) |

---

## Real-time (Socket.IO)

Socket URL: `http://localhost:5000` (same as API). Authenticated with the bearer token via the `auth` handshake; anonymous connections are rejected (`UNAUTHORIZED`).

| Event | Direction | Payload |
| --- | --- | --- |
| `order:new` | backend → restaurant | New order (toast + live queue) |
| `order:updated` | backend → customer & restaurant | Order status changed (live timeline) |

If the socket drops, the customer tracking page falls back to light polling and refetches on reconnect.

---

## Docker (production setup — exists, not running on this dev machine)

Files: `docker-compose.yml` (prod), `docker-compose.dev.yml` (hot-reload override), `docker/` Dockerfiles + nginx configs.

| Service | Image | Port |
| --- | --- | --- |
| mongodb | mongo:8 | 27017 |
| backend | multi-stage node build | 5000 |
| customer-web | node build → nginx | 3000 → 80 |
| restaurant-web | node build → nginx | 3001 → 80 |

```bash
# Production-style stack (requires Docker; needs JWT_SECRET set)
cp .env.production.example .env.production   # edit JWT_SECRET, CORS_ORIGINS, ...
docker compose --env-file .env.production up --build -d

# Local hot-reload instead
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

**On this machine:** Docker is not installed, so nothing runs in containers. The same services run natively: MongoDB via a local `mongod` binary (`data/mongo`), the API from `backend/dist`, and the two Vite dev servers. Production hardening (helmet, rate limits, health checks, graceful shutdown, indexes) is active in both modes.

---

## Local Development (native, no Docker)

```bash
npm install
cp .env.example .env            # adjust MONGODB_URI / service center if needed
npm run seed --workspace=backend   # 12 restaurants, menus, coupons, demo accounts
# three terminals:
npm run dev:backend             # :5000
npm run dev:customer            # :3000
npm run dev:restaurant          # :3001
```

Dev OTPs: set `OTP_DELIVERY=console` in `backend/.env` to see codes in the API log, or leave it unset (defaults to console). The code is also readable from `GET /auth/dev-otp?email=...` (dev/E2E only).

---

## Environment Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | 5000 | API port |
| `MONGODB_URI` | local URI | MongoDB connection |
| `JWT_SECRET` | dev-only fallback | Session signing (**required** in production) |
| `SERVICE_CENTER_LAT/LNG` | 19.076 / 72.8777 | Delivery center (seeded; admin-editable) |
| `SERVICE_RADIUS_KM` | 10 | Initial delivery radius (seeded; admin-editable) |
| `BASE_DELIVERY_FEE` | 20 | Delivery fee |
| `DELIVERY_FEE_FREE_ABOVE` | 499 | Free delivery above this subtotal |
| `OTP_DELIVERY` | console | `console` (log only) · `smtp` (NodeMailer relay) · `brevo` (REST API) |
| `OTP_TTL_MS` / `OTP_MAX_ATTEMPTS` / `OTP_RESEND_COOLDOWN_MS` | 300000 / 5 / 60000 | OTP expiry, lockout, resend cooldown |
| `CORS_ORIGINS` | localhost:3000,3001 | Allowed browser origins |
| `RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_MAX` | 300 / 10 | API / auth rate limits |

---

## Testing

```bash
npm run test:api --workspace=backend   # 109 end-to-end API tests (in-memory MongoDB, no Docker)
npm run typecheck --workspace=backend
npm run build                          # typechecks + builds all workspaces
node scripts/browser-walk.mjs          # 46 real-browser checks (needs the three apps + MongoDB running)
```

Coverage highlights: full OTP security matrix (wrong/expired/reused codes, lockout, cooldown, duplicate phones, ADMIN role spoofing, expired sessions), service-area rules (inside/at/outside radius, admin radius changes, out-of-area order rejection), complete customer flow, restaurant status state machine, ownership authorization boundaries, coupons (invalid/expired/restaurant-scoped/used), price tampering, duplicate submissions, real-time socket events, and mobile overflow checks at 390 px.

---

## Key Design Decisions

- **OTP only, no passwords** — simpler for users and the MVP; the `EmailService` abstraction leaves room for password recovery later if ever needed.
- **Server is the authority** — prices, discounts, fees, coupons, roles, and the delivery-radius rule are all recomputed/enforced on the backend. Frontend values are never trusted.
- **Admin-driven delivery area** — the radius lives in MongoDB (not hardcoded) and can change live without a redeploy.
- **Order item snapshots** — orders keep a copy of item names/prices, so later menu changes never rewrite history.
- **Provider abstractions** — OTP, email, and payment (`COD` / `MockPayment`) are interfaces, so real SMS, transactional email, and Razorpay/Stripe can be dropped in without touching business logic.
