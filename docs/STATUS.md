# Ramnagar Eats — Project Status

> Everything below was verified with **real tests** on this codebase (August 2026). See
> [docs/BACKLOG.md](./BACKLOG.md) for everything that is pending.

---

## 1. What is DONE (built + verified)

### Platform

| Area | Status | Evidence |
| --- | --- | --- |
| Customer web app (browse, cart, coupons, checkout, orders, tracking, profile, addresses) | ✅ Done | 64/64 browser E2E checks (`scripts/browser-walk.mjs`) |
| Restaurant partner dashboard (live queue, status flow, menu CRUD, profile, open/close) | ✅ Done | Same browser walk, real-time flow verified |
| Admin panel (metrics, restaurants, users, orders, service area) | ✅ Done | Walk: radius edit round-trip; API tests: admin endpoints |
| Backend API (Express + MongoDB, REST + Socket.IO) | ✅ Done | **143/143 API acceptance tests** pass |
| Auth — email OTP + Google OAuth, role-based (CUSTOMER/RESTAURANT/ADMIN) | ✅ Done | OTP security matrix + role-spoofing tests; Google dev-callback E2E |
| Server-authoritative pricing & coupons | ✅ Done | Tampering / invalid-coupon tests |
| Service-area enforcement (radius rule, re-checked at checkout + order) | ✅ Done | Inside / exactly-at / outside radius tests |
| Real-time order flow (Socket.IO, toasts, live status) | ✅ Done | Socket tests + browser walk (no reloads) |
| Image uploads (avatar, cover, menu) | ✅ Done | Upload 201 + CORP fix verified in walk |
| Production Docker stack | ✅ Done | `docker compose up --build` boots green in CI |
| GitHub Actions CI (typecheck + build + 143 API tests + Docker stack) | ✅ Done | CI green on `main` |

### Hardening (verified with live checks)

| Item | Status | Evidence |
| --- | --- | --- |
| Helmet security headers (CSP, HSTS, nosniff, frame, COOP, referrer) | ✅ Verified | `curl -I` shows all headers on every API response |
| CORS allowlist | ✅ Done | `CORS_ORIGINS` env, no wildcards |
| Rate limiting (API + stricter auth) | ✅ Done | Covered by API tests |
| Consistent error format `{success, message, code}` | ✅ Done | API tests + manual curl |
| Body size limits, graceful shutdown, health endpoint | ✅ Done | Health endpoint live; startup validation in production |
| Secrets never in frontend / repo | ✅ Done | Repo tree on GitHub verified: no `.env`, `node_modules`, `data`, `uploads`, `dist` |

---

## 2. Service audit — real tests performed

| Service | Provider (dev → prod) | Real test performed | Result |
| --- | --- | --- | --- |
| **Database** | Local `mongod` / Mongo 8 in Docker | 143 API tests against real Mongo; Docker stack health check | ✅ Working |
| **Real-time** | Socket.IO (self-hosted) | Socket auth + `order:new`/`order:updated` events in tests + browser walk | ✅ Working |
| **Maps / geo** | Leaflet + OpenStreetMap tiles (browser) | Live browser test: 6/6 tiles loaded from `tile.openstreetmap.org` (HTTP 200) | ✅ Working |
| **Distance / serviceability** | In-house haversine (no external API) | Live curl: center (0 km, serviceable) and Delhi (1146.3 km, rejected) | ✅ Working |
| **Email** | Console (dev) → Brevo (prod) | Brevo wiring tested against the real `api.brevo.com`: fake key → real `401 "Key not found"` | ✅ Wired, ⚠️ needs real key (backlog) |
| **Images** | Local disk (dev) → ImageKit (prod) | ImageKit wiring tested against real API: fake keys → real `403 "account cannot be authenticated"` | ✅ Wired, ⚠️ needs real keys (backlog) |
| **Google OAuth** | Dev-callback (dev) → Google (prod) | Unconfigured server returns clean `503 GOOGLE_NOT_CONFIGURED`; dev-callback round-trip green in walk | ✅ Wired, ⚠️ needs real OAuth app (backlog) |
| **Payments** | COD + Mock (no real gateway) | Order flow with COD/Mock passes; **no real gateway exists** | ⚠️ Backlog: Razorpay/Stripe |
| **Uploads serving** | API static `/uploads` (dev) | Browser walk uploads + previews; CORP header verified `cross-origin` | ✅ Working |
| **Security headers** | Helmet | `curl -I` on live API | ✅ Working |
| **Geolocation (GPS)** | Browser API (no key) | Flow implemented; not testable headless | ✅ Implemented |

---

## 3. What is NOT done / not active

1. **Real email delivery** — provider is wired and tested, but no `BREVO_API_KEY` is set; dev uses the console provider.
2. **ImageKit CDN** — provider wired and tested, but no `IMAGEKIT_*` keys; dev stores images on local disk.
3. **Google sign-in** — flow wired, but no Google Cloud OAuth app exists; server returns `503` until configured.
4. **Real payment gateway** — only Cash-on-Delivery and a mock provider; no online payment.
5. **SMTP provider** — the dev compose file references `SMTP_HOST`/`SMTP_PORT` (mailpit) but the email service has **no SMTP provider**; only Console and Brevo exist. (Inconsistency → backlog.)
6. **Admin coupon management** — coupons are seeded in the DB but there is **no admin UI/API to create/edit coupons**.
7. **Multiple service areas / cities** — the platform supports exactly **one** admin-configurable delivery area.
8. **Pincode validation** — pincode is stored as text and never cross-checked against the map/GPS coordinates (no geocoding), so any pincode can be paired with any map point.
9. **Browser E2E walk not in CI** — it needs Edge + three running apps; runs locally only.
10. **Everything under "Backlog"** in [docs/BACKLOG.md](./BACKLOG.md).

---

## 4. Configuration — dynamic vs hardcoded

### Already dynamic (env / DB / admin-editable)

- Service center lat/lng/address/pincode + radius → **DB**, admin-editable, enforced server-side
- Delivery fees (`BASE_DELIVERY_FEE`, `DELIVERY_FEE_FREE_ABOVE`) → **env**, exposed via `GET /api/v1/config`
- OTP TTL / max attempts / resend cooldown → **env**
- Rate limits, CORS origins, JWT secret, ports → **env**
- Coupons, restaurants, menu, categories, offers, users, orders → **DB**
- Sender email (`EMAIL_FROM`) → **env**

### Hardcoded (should become configurable → see BACKLOG)

- Currency symbol `₹` (backend + frontend)
- Order-number prefix `RE-`
- OTP "expires in 5 minutes" email copy (ignores `OTP_TTL_MS`)
- App brand name "Ramnagar Eats" (UI + emails)
- Homepage hero copy + "30 min delivery" chip
- Phone placeholder `+919876543210` (India-specific)
- Default map position `[19.076, 72.8777]` in the location sheet (should come from `/config`)
- Google Fonts (DM Sans) import
