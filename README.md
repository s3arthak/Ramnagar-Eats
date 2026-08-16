# Ramnagar Eats

Hyperlocal food delivery for one configured service area (default: Mumbai, 5 km radius). A customer web app, a restaurant partner dashboard (with an admin panel), and one Express + MongoDB API with real-time order updates.

## Documentation

- [docs/FEATURES.md](docs/FEATURES.md) — every feature in plain English
- [docs/STATUS.md](docs/STATUS.md) — what is done vs not, with per-service real-test evidence
- [docs/BACKLOG.md](docs/BACKLOG.md) — prioritized backlog (pending features, dynamic-config work, service integrations)
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Render + Vercel hosting plan

## Apps

| App | URL | Purpose |
| --- | --- | --- |
| Customer Web | http://localhost:3000 | Browse restaurants, order, track |
| Restaurant Web | http://localhost:3001 | Partner dashboard, orders, menu, admin |
| API | http://localhost:5000/api/v1 | REST API + Socket.IO |

## Local development

1. Copy `.env.example` to `.env` and adjust `MONGODB_URI`, `SERVICE_CENTER_LAT/LNG`, `SERVICE_RADIUS_KM`.
2. Install packages: `npm install`.
3. Start MongoDB. With Docker: `docker compose up mongodb` (or use your own MongoDB).
4. Seed sample data: `npm run seed --workspace=backend` — creates 12 restaurants, menus, coupons, and demo accounts.
5. Run the apps in separate terminals:
   - `npm run dev:backend`
   - `npm run dev:customer`
   - `npm run dev:restaurant`

## Demo accounts (seeded)

All accounts log in with **email + OTP** (or Google) — there are no passwords. In development the code is printed to the API log and is also readable from the non-production helper `GET /api/v1/auth/dev-otp?email=...` (used by the E2E tests; never enabled with `NODE_ENV=production`).

| Role | Phone |
| --- | --- |
| Admin | `+919876500002` |
| Restaurant owner (owns Biryani Blues) | `+919876500001` |
| Customer | `+919876500000` |

Customers register from the customer app; restaurant owners register from the restaurant app login page. The server always assigns the role — the client can never create an ADMIN.

## Testing

```bash
# End-to-end API acceptance tests (uses an in-memory MongoDB, no Docker needed)
npm run test:api --workspace=backend

# Typechecks / builds
npm run typecheck --workspace=backend
npm run build
```

The API test suite covers the full customer flow (OTP register → login → browse → menu → coupon → order), every documented failure case (out-of-stock, invalid/expired coupon, wrong address, closed restaurant, price tampering, duplicate submissions, cross-restaurant cart), restaurant status transitions, owner authorization boundaries, admin operations, real-time Socket.IO events, the complete OTP security matrix (wrong/expired/reused codes, attempt lockout, resend cooldown, duplicate phones, role spoofing), and the service-area rules (inside/exactly-at/outside radius, admin radius changes taking effect immediately, out-of-area orders rejected server-side).

The API test suite currently passes **162/162** checks. With the apps running locally, a real-browser walkthrough (Playwright driving Edge) verifies the whole flow end to end — including the real-time order flow (restaurant receives the new-order toast/tile live, both sides update without reloads), the live tracking map with route + dynamic ETA, and the Google OAuth round-trip (currently **76/76** checks):

```bash
node scripts/browser-walk.mjs   # needs Edge, MongoDB, and the three apps running
```

## Feature summary

- **Customer**: homepage with search + cuisine categories + restaurant sections, filterable/sortable restaurant listing (`/restaurants`), restaurant detail with menu search, sticky categories and item customizations (`/restaurant/:id`), **email + Google OTP auth** (no passwords; OTP with expiry, resend timer, attempt lockout and reuse prevention), service-area validation with map + pincode, cart with single-restaurant rule, free-delivery progress and coupon rack (drawer + `/cart`), address book with city/state/locality (`/addresses`), checkout with backend-validated coupons, out-of-area address blocking and COD/mock payment (`/checkout`), order confirmation (`/order/:id/success`), order history + real-time tracking timeline (`/orders`, `/orders/:id`) with a **live route map** (restaurant 🍴 → home 🏠 markers, road-route polyline, auto-fit bounds, dynamic ETA countdown), **in-app status-change toasts**, and **Call restaurant / Get directions** actions on the tracking page, reorder, profile (`/profile`). Restaurant pages show the **phone (Call button), live location mini-map + directions link, and a dynamic reviews section** (star breakdown + recent reviews) — nothing hardcoded.
- **Restaurant**: dashboard with live stats, order queue with accept/reject/prepare/ready/out-for-delivery/delivered actions and real-time new-order toasts (Socket.IO), **customer phone with a tap-to-call link on every order tile**, open/close toggle, full menu management (categories + items, availability, pricing, veg/popular flags), profile management.
- **Admin** (in the restaurant app at `/admin`): platform metrics, restaurant approve/disable, users, all orders.
- **Backend**: role-based auth (`CUSTOMER` / `RESTAURANT` / `ADMIN`) via OTP only, hashed OTP storage (scrypt), consistent `{ success, message, code }` error responses, server-authoritative order pricing (menu prices and coupons are re-verified from the DB at order time — client totals are never trusted), order item snapshots, idempotent order creation, replaceable payment layer (`CODPayment` / `MockPayment`), **routing service** (`GET /orders/:id/route` — Mapbox Directions when `MAPBOX_ACCESS_TOKEN` is set, geodesic fallback otherwise; route cached per order, ETA dynamic), public **reviews endpoint** (`GET /restaurants/:id/reviews` with star breakdown), transactional `EmailService` abstraction (console provider in dev; Brevo SMTP live — wired to welcome, OTP, **order confirmation, order status, and cancellation** emails with branded HTML templates; dev OTP codes are printed to the server log), admin-controlled service area (lat/lng/address/pincode/radius in MongoDB — serviceability is re-checked at checkout and enforced at order creation, so the radius rule cannot be bypassed via the API).

## API overview

```
POST /api/v1/auth/send-otp · POST /api/v1/auth/verify-otp · POST /api/v1/auth/register
POST /api/v1/auth/logout · GET /api/v1/auth/me
GET  /api/v1/restaurants · GET /api/v1/restaurants/:id · GET /api/v1/restaurants/:id/menu
GET  /api/v1/categories · GET /api/v1/locations/serviceability · GET /api/v1/config
POST /api/v1/coupons/validate
POST /api/v1/orders · GET /api/v1/orders · GET /api/v1/orders/:id · GET /api/v1/orders/:id/route · PATCH /api/v1/orders/:id/cancel
GET  /api/v1/restaurants/:id/reviews
GET  /api/v1/users/addresses · POST | PATCH | DELETE /api/v1/users/addresses[/:id]
GET  /api/v1/restaurant/orders · PATCH /api/v1/restaurant/orders/:id/status · PATCH /api/v1/restaurant/status · GET /api/v1/restaurant/dashboard
GET  /api/v1/restaurants/me ... (owner profile, categories, menu items)
GET  /api/v1/admin/metrics | restaurants | users | orders · GET/PATCH /api/v1/admin/service-area · PATCH /api/v1/admin/restaurants/:id
```

## Production stack

`docker compose up --build` builds and runs MongoDB, the API, and both web apps as production containers (each web app is served by nginx; the API runs with `NODE_ENV=production`).

Required: set `JWT_SECRET` (generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) — compose fails fast if it is missing. Set `OTP_PROVIDER=console` in production (the `test` provider and `/auth/dev-otp` endpoint are compile-time disabled when `NODE_ENV=production`). See `.env.production.example` for the full production variable set.

```bash
cp .env.production.example .env.production
# edit JWT_SECRET, CORS_ORIGINS, MONGODB_URI ...
docker compose --env-file .env.production up --build -d
```

### Production hardening (built in)

- **Helmet** security headers (CSP, HSTS, nosniff, frame protection) on every response.
- **Rate limiting** via `express-rate-limit`: 300 req/min/IP on `/api`, 10 attempts/min/IP on `/auth` (successful logins don't count), configurable via `RATE_LIMIT_*` / `AUTH_RATE_LIMIT_*` env vars.
- **CORS** locked to the `CORS_ORIGINS` allowlist (comma-separated) — no wildcards.
- **Body size limits** (100 kb JSON/urlencoded) and `trust proxy` enabled behind nginx.
- **Structured request logging** (method, path, status, duration; 5xx as error, 4xx as warn).
- **Startup config validation**: production refuses to boot without `JWT_SECRET`.
- **MongoDB indexes**: `2dsphere` on restaurant location, unique phone/email, unique coupon code, unique idempotency key per customer, compound indexes for order queues and menu lookups.
- **Graceful shutdown**: SIGINT/SIGTERM close the HTTP server, stop accepting sockets, and disconnect MongoDB with a 10s force-exit timeout.
- **Health checks** on every container; the API health endpoint reports DB connectivity + environment.

For local hot reload instead: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up` (dev override, no hardening).
