# Deployment Plan — Render (API) + Vercel (Web Apps)

How to take the current local setup live. Two frontends (customer + restaurant) on
**Vercel**, one backend (Express + Socket.IO + MongoDB) on **Render**. MongoDB stays on
**Atlas** (already configured). This is a plan — nothing here has been executed.

---

## Architecture

```
┌────────────────────┐   ┌────────────────────┐
│  customer-web      │   │  restaurant-web    │
│  (Vercel, :3000)   │   │  (Vercel, :3001)   │
│  Vercel project A  │   │  Vercel project B  │
└─────────┬──────────┘   └─────────┬──────────┘
          │  HTTPS /api/v1/*       │  HTTPS /api/v1/* + Socket.IO (ws)
          ▼                        ▼
        ┌──────────────────────────────────────┐
        │  ramnagar-eats-api  (Render web svc) │
        │  Express + Socket.IO, NODE_ENV=prod  │
        └─────────────────┬────────────────────┘
                          │ mongodb+srv
                          ▼
              MongoDB Atlas (already live)
```

- Both web apps call the SAME API base URL (one Vercel env var: `VITE_API_URL`).
- Socket.IO is a plain WebSocket upgrade on the same Render service — no extra infra.
- Nothing runs inside Vercel Functions; Vercel only serves static React builds and
  proxies API calls to Render.

---

## Step 1 — MongoDB Atlas

Already running (cluster `cluster0`, db `ramnagar-eats`). Two things to confirm:

1. **Network access**: allow the IPs Render uses to reach Atlas. Simplest for launch:
   allow `0.0.0.0/0` **with the database user password set** (never a blank auth), or
   add Render's egress IPs (see Render dashboard → your service → *Events/Details*).
2. **Database user**: `kharkasarthak_db_user` already exists and authenticates
   (verified locally). Reuse it; keep the password in the Render env vars only.

---

## Step 2 — Render: the API service

**Create** a new **Web Service** in Render, connected to this repo (or the
`backend/` subdirectory).

| Setting | Value |
| --- | --- |
| Root directory | `backend` (if repo-connected) |
| Build command | `npm ci && npm run build` |
| Start command | `node dist/server.js` |
| Instance type | Free tier is fine to start (single instance — see Socket.IO note) |
| Health check path | `/api/v1/health` |

**Environment variables** (all required, none committed):

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `MONGODB_URI` | `mongodb+srv://kharkasarthak_db_user:<password>@cluster0.dsfzkf3.mongodb.net/ramnagar-eats` |
| `JWT_SECRET` | generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `CORS_ORIGINS` | `https://<customer-domain>.vercel.app,https://<restaurant-domain>.vercel.app` (comma-separated, no spaces) |
| `OTP_PROVIDER` | `brevo` (or `smtp`) — the dev-otp endpoint is compile-time disabled in production |
| `EMAIL_FROM` | a **verified sender** in Brevo (unverified `.test` senders get spam-filtered) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Brevo SMTP relay creds (`smtp-relay.brevo.com:587`) |
| `MAPBOX_ACCESS_TOKEN` | optional — public token for real road routes; without it the geodesic fallback is used |
| `BASE_DELIVERY_FEE`, `DELIVERY_FEE_FREE_ABOVE`, `CURRENCY_SYMBOL`, `ORDER_PREFIX`, `BRAND_NAME`, `PHONE_COUNTRY_CODE` | same values as `.env.production` |
| `RATE_LIMIT_*`, `AUTH_RATE_LIMIT_*`, `OTP_TTL_MS`, `OTP_MAX_ATTEMPTS`, `OTP_RESEND_COOLDOWN_MS` | defaults are fine |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | existing Google OAuth app |

**Google OAuth**: add a production callback URI to the Google Cloud console:
`https://<your-api-domain>.onrender.com/api/v1/auth/google/callback`
(the dev `localhost:5000` URI stays for local testing).

**Socket.IO note**: WebSockets work on Render, but only to the single instance that
holds the socket. With one instance (free/startup tier) this is fine; if you scale to
multiple instances later, either pin connections (sticky sessions) or add a pub/sub
adapter (Redis) for Socket.IO.

**Mapbox (optional)**: if you add `MAPBOX_ACCESS_TOKEN`, the route endpoint returns
real road polylines. Free tier covers this app's volume. Set it, then trigger a redeploy.

---

## Step 3 — Vercel: two frontend projects

Create **two separate Vercel projects** (the monorepo has two independent Vite apps):

| | customer-web | restaurant-web |
| --- | --- | --- |
| Root directory | `apps/customer-web` | `apps/restaurant-web` |
| Framework preset | Vite | Vite |
| Build command | `npm ci && npm run build` | `npm ci && npm run build` |
| Output directory | `dist` | `dist` |
| Env var `VITE_API_URL` | `https://<your-api-domain>.onrender.com/api/v1` | same |

**SPA routing**: Vercel serves static files; add a rewrite so deep links work
(`/orders/123`, `/admin`, …). Add `vercel.json` in each app root:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

(If Vite's `base` is left at `/`, no other config is needed.)

**CORS**: after both projects deploy, update the Render `CORS_ORIGINS` env var with the
two real `*.vercel.app` (or custom) domains and redeploy Render.

**Socket.IO from Vercel**: the frontend connects its WebSocket to the Render domain
(the socket client uses `VITE_API_URL`'s host), which Vercel allows since it is a
direct client→Render connection, not a Vercel proxy.

---

## Step 4 — Cutover checklist

1. [ ] Atlas network access allows Render (or `0.0.0.0/0` + strong DB password).
2. [ ] Render service boots green: log shows `MongoDB connected` + `API listening`; `/api/v1/health` returns `{"database":"connected"}`.
3. [ ] Both Vercel projects deploy green and load with no console errors.
4. [ ] Register a fresh customer on the customer site (OTP email arrives from Brevo with the **verified** sender).
5. [ ] Restaurant owner logs in on the restaurant site; OTP email arrives.
6. [ ] Place an order: real-time toasts on both sides (Socket.IO over HTTPS works).
7. [ ] Google sign-in works from both domains (production callback URI added).
8. [ ] Admin logs in (`admin@ramnagareats.test`), edits the service area from the live admin panel.
9. [ ] Tracking page shows the route map + dynamic ETA; optionally verify a road route after adding the Mapbox token.
10. [ ] `git status` clean — no `.env` / secrets in the repo; all secrets live in Render/Vercel env vars.

---

## Notes & gotchas

- **HTTPS**: Vercel + Render both serve HTTPS by default — the browser GPS
  geolocation API ("use my current location") requires HTTPS and will work in prod.
- **Email deliverability**: the admin/restaurant emails currently go to
  `*.ramnagareats.test` addresses (fake inboxes). For real sign-ups, users use real
  emails; verify your sender domain in Brevo first (`EMAIL_FROM`).
- **Render free tier** sleeps after inactivity — first request after idle takes
  ~30–60 s to cold start. The health check keeps the service warm while it's being used.
- **Database**: Atlas is outside Render — no persistent-disk worry. Take an Atlas
  backup before go-live and periodically after.
- **Seeding**: run the seed against Atlas once before go-live
  (`npm run seed --workspace=backend` with the production URI) to create demo
  restaurants, menus, coupons, and the admin account.
- **Scaling later**: add Socket.IO Redis adapter + sticky sessions on Render, and a
  real payment gateway (P0 backlog) before taking real money.
