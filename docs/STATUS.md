# Ramnagar Eats — Project Status

> Everything below was verified with **real tests** on this codebase (August 2026). See
> [docs/BACKLOG.md](./BACKLOG.md) for everything that is pending.

---

## 1. What is DONE (built + verified)

### Platform

| Area | Status | Evidence |
| --- | --- | --- |
| Customer web app (browse, cart, coupons, checkout, orders, tracking, profile, addresses) | ✅ Done | 76/76 browser E2E checks (`scripts/browser-walk.mjs`) |
| Restaurant partner dashboard (live queue, status flow, menu CRUD, profile, open/close) | ✅ Done | Same browser walk, real-time flow verified |
| Admin panel (metrics, restaurants, users, orders, service area, coupons) | ✅ Done | Walk: radius edit round-trip; API tests: admin endpoints + coupon CRUD |
| Backend API (Express + MongoDB, REST + Socket.IO) | ✅ Done | **162/162 API acceptance tests** pass |
| Live tracking map (restaurant→home route, polyline, dynamic ETA) | ✅ Done | Walk: route map tiles + markers + ETA badge; API: route endpoint (geodesic fallback; Mapbox-ready) |
| Customer in-app notifications (status-change toasts) | ✅ Done | Walk: tracking page live-updates to DELIVERED; toasts on every status move |
| Restaurant contact + location + reviews in customer UI | ✅ Done | Walk: call/directions actions, mini-map tiles, reviews section; API: reviews endpoint |
| Transactional emails (welcome, OTP, confirmation, status, cancelled) | ✅ Done | Real SMTP send verified; status/cancellation emails wired + branded HTML |
| Auth — email OTP + Google OAuth, role-based (CUSTOMER/RESTAURANT/ADMIN) | ✅ Done | OTP security matrix + role-spoofing tests; Google dev-callback E2E |
| Server-authoritative pricing & coupons | ✅ Done | Tampering / invalid-coupon tests |
| Service-area enforcement (radius rule, re-checked at checkout + order) | ✅ Done | Inside / exactly-at / outside radius tests |
| Real-time order flow (Socket.IO, toasts, live status) | ✅ Done | Socket tests + browser walk (no reloads) |
| Image uploads (avatar, cover, menu) | ✅ Done | Upload 201 + CORP fix verified in walk |
| Production Docker stack | ✅ Done | `docker compose up --build` boots green in CI |
| GitHub Actions CI (typecheck + build + 151 API tests + Docker stack) | ✅ Done | CI green on `main` |

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
| **Database** | Local `mongod` / Mongo 8 in Docker | 151 API tests against real Mongo; Docker stack health check | ✅ Working |
| **Real-time** | Socket.IO (self-hosted) | Socket auth + `order:new`/`order:updated` events in tests + browser walk | ✅ Working |
| **Maps / geo** | Leaflet + OpenStreetMap tiles (browser) | Live browser test: 6/6 tiles loaded from `tile.openstreetmap.org` (HTTP 200) | ✅ Working |
| **Distance / serviceability** | In-house haversine (no external API) | Live curl: center (0 km, serviceable) and Delhi (1146.3 km, rejected) | ✅ Working |
| **Email** | Console (dev) → Brevo SMTP relay (prod) | **Real send verified**: welcome email delivered to a Gmail inbox via `smtp-relay.brevo.com:587` (STARTTLS + SMTP key auth). Status + cancellation emails wired with branded HTML; dev OTP printed to the server log | ✅ Working |
| **Route / ETA** | Mapbox Directions (token) → geodesic fallback | Live API: polyline + distance + dynamic ETA; walk: route map renders; Mapbox token optional (road routes) | ✅ Working (fallback) / ⚠️ road routes need token |
| **Images** | Local disk (dev) → ImageKit CDN (prod) | **Real end-to-end verified**: uploaded a test image via the app's provider → served from `ik.imagekit.io` (HTTP 200) → deleted (404 after). Keys authenticated against the real ImageKit API | ✅ Working |
| **Google OAuth** | Dev-callback (dev) → Google (prod) | **Live**: `/auth/google` redirects to `accounts.google.com` with the real client ID (verified for both apps); dev-callback round-trip green. Remaining: authorize redirect URIs in the Google Cloud console + a real browser sign-in | ✅ Configured, ⚠️ redirect URIs + browser test pending |
| **Payments** | COD + Mock (no real gateway) | Order flow with COD/Mock passes; **no real gateway exists** | ⚠️ Backlog: Razorpay/Stripe |
| **Uploads serving** | API static `/uploads` (dev) | Browser walk uploads + previews; CORP header verified `cross-origin` | ✅ Working |
| **Security headers** | Helmet | `curl -I` on live API | ✅ Working |
| **Geolocation (GPS)** | Browser API (no key) | Flow implemented; not testable headless | ✅ Implemented |

---

## 3. What is NOT done / not active

1. **Sender verification / deliverability** — SMTP delivery works (Brevo accepted and delivered a real test email), but `EMAIL_FROM` uses an unverified `.test` sender; verify a real domain in Brevo and update `EMAIL_FROM` so emails don't land in spam.
2. *(resolved — ImageKit CDN is live and verified; uploads now go to the CDN)*
3. **Google sign-in browser round-trip** — client ID/secret are set and the redirect to Google works; a real browser login still needs the **Authorized redirect URIs** added in the Google Cloud console (`http://localhost:5000/api/v1/auth/google/callback` for dev, the production callback once a domain exists).
4. **Real payment gateway** — only Cash-on-Delivery and a mock provider; no online payment (deferred by the owner).
5. **Multiple service areas / cities** — the platform supports exactly **one** admin-configurable delivery area.
6. **Pincode ↔ coordinates cross-check** — the pincode format is now validated (6-digit), but it is not yet cross-checked against the map/GPS coordinates (no geocoding service), so any pincode can still be paired with any map point.
7. **Browser E2E walk not in CI** — it needs Edge + three running apps; runs locally only.
8. **Everything under "Backlog"** in [docs/BACKLOG.md](./BACKLOG.md).

---

## 4. Configuration — dynamic vs hardcoded

### Already dynamic (env / DB / admin-editable)

- Service center lat/lng/address/pincode + radius → **DB**, admin-editable, enforced server-side
- Delivery fees (`BASE_DELIVERY_FEE`, `DELIVERY_FEE_FREE_ABOVE`) → **env**, exposed via `GET /api/v1/config`
- Currency symbol (`CURRENCY_SYMBOL`), order prefix (`ORDER_PREFIX`), brand name (`BRAND_NAME`), default phone country code (`PHONE_COUNTRY_CODE`) → **env**, consumed by backend copy + both apps via `GET /api/v1/config`
- OTP TTL / max attempts / resend cooldown → **env** (email copy derives the expiry text from the configured TTL)
- Rate limits, CORS origins, JWT secret, ports → **env**
- Email delivery (SMTP relay creds or Brevo API key, `OTP_DELIVERY` mode, sender `EMAIL_FROM`) → **env**
- Coupons (admin CRUD), restaurants, menu, categories, offers, users, orders → **DB**

### Hardcoded (should become configurable → see BACKLOG)

- Homepage hero *headline/subcopy* (the eyebrow brand name and the chips — delivery time + top-rated count — are already dynamic from `/config` and live data)
- Google Fonts (DM Sans) import
- Frontend logo markup (deliberately a static brand design element; brand name itself is server-driven via `BRAND_NAME`/`/config` for all copy)
