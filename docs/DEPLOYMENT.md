# Deployment — Local Docker Compose (bundled MongoDB)

The whole stack runs on one machine with Docker: the bundled **MongoDB**
container (persistent `mongo-data` volume — no external database needed),
the **API**, and both web apps (customer + restaurant) served by nginx.
No Atlas, no external hosting required.

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│  docker compose up --build  (one machine, one network)     │
│                                                            │
│  customer-web  :3000  (nginx, static build)                │
│  restaurant-web:3001  (nginx, static build)                │
│        │  HTTPS/HTTP /api/v1/* + Socket.IO (ws)            │
│        ▼                                                   │
│  backend :5000  (Express + Socket.IO, NODE_ENV=production) │
│        │  mongodb://mongodb:27017/ramnagar-eats            │
│        ▼                                                   │
│  mongodb (mongo:8, data in the mongo-data volume)          │
└────────────────────────────────────────────────────────────┘
```

- The API talks to the bundled `mongodb` container by service name — no
  `localhost` or external URI to configure.
- **Data lives in the Docker volume `mongo-data`** — it survives
  `docker compose down` and container rebuilds. Removing it (e.g. with
  `docker compose down -v`) erases all data, so back it up first.
- Socket.IO is a plain WebSocket upgrade on the same backend port.

---

## Step 1 — Prerequisites

1. **Docker Desktop** (or any Docker engine with `docker compose`).
2. Copy the production env template and set the required values:

```bash
cp .env.production.example .env.production
```

Edit `.env.production`:

| Variable | Value |
| --- | --- |
| `MONGODB_URI` | leave at `mongodb://mongodb:27017/ramnagar-eats` (the bundled container) |
| `JWT_SECRET` | generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `OTP_DELIVERY` | `console` (dev — codes printed to the API log) or `smtp` (needs `SMTP_*` + verified `EMAIL_FROM`) |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:3001` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional — Google sign-in (redirect URI `http://localhost:5000/api/v1/auth/google/callback`) |
| `IMAGEKIT_*` | optional — image CDN; without them images store on the API's local disk (`/uploads`) |

Compose fails fast if `JWT_SECRET` is missing.

---

## Step 2 — Build and run

```bash
docker compose --env-file .env.production up --build -d
```

| App | URL |
| --- | --- |
| Customer web | http://localhost:3000 |
| Restaurant web | http://localhost:3001 |
| API + Socket.IO | http://localhost:5000/api/v1 |
| Health check | http://localhost:5000/api/v1/health |

Check it came up green:

```bash
docker compose ps                # all four services: running (healthy)
curl http://localhost:5000/api/v1/health   # {"status":"ok","database":"connected",...}
```

---

## Step 3 — Seed sample data (fresh installs only)

The bundled MongoDB starts empty. On a fresh deployment, seed the demo
restaurants, menus, coupons, and demo accounts:

```bash
docker compose --env-file .env.production up seed
```

This is a one-shot container; run it whenever you want to reset to demo
data (it refuses to overwrite existing restaurants).

---

## Step 4 — Everyday operations

```bash
docker compose logs -f backend     # API logs (OTP codes in dev, if console)
docker compose down                # stop everything (data stays in the volume)
docker compose up -d               # start again
docker compose up --build -d       # rebuild after pulling new code
```

### Backups (do this regularly — the volume is your only copy)

```bash
docker compose exec mongodb mongodump --archive=/data/db/dump-$(date +%F).archive
docker compose cp mongodb:/data/db/dump-<date>.archive ./backups/
```

Restore with `mongorestore --archive=...`.

---

## Cutover checklist

1. [ ] `docker compose ps` — mongodb, backend, customer-web, restaurant-web all healthy.
2. [ ] `curl http://localhost:5000/api/v1/health` → `"database":"connected"`.
3. [ ] `http://localhost:3000` loads; `http://localhost:3001` loads (restaurant dashboard).
4. [ ] Register/login a customer on :3000 — OTP arrives (console log or email).
5. [ ] Place an order — real-time toasts on both sides (Socket.IO).
6. [ ] Restaurant owner logs in on :3001, accepts an order, status updates live.
7. [ ] Admin (`/admin` on :3001) edits the service area — takes effect immediately.
8. [ ] Tracking page shows the route map + dynamic ETA.
9. [ ] `git status` clean — no secrets committed; secrets live in `.env.production` (gitignored).

---

## Notes & gotchas

- **Data persistence**: everything lives in the `mongo-data` volume. Back it
  up before any `docker compose down -v`.
- **Email**: with `OTP_DELIVERY=console` no SMTP is needed — codes print to
  the API log (`docker compose logs -f backend`). To send real mail, set
  `OTP_DELIVERY=smtp`, the `SMTP_*` vars, and a **verified** `EMAIL_FROM`
  sender; unverified senders get spam-filtered.
- **Google OAuth**: the redirect URI must be
  `http://localhost:5000/api/v1/auth/google/callback` in the Google Cloud
  console when running locally.
- **ImageKit**: without the three `IMAGEKIT_*` keys, uploads go to the API
  container's local disk, which is **ephemeral** — they disappear on
  `docker compose down` + rebuild. Add ImageKit keys if images must persist.
- **HTTPS**: localhost works without HTTPS, but the browser geolocation API
  ("use my current location") requires a secure context — use
  `http://localhost` (treated as secure) or add a reverse proxy with TLS.
- **Scaling later**: if this ever moves to the cloud, use a managed or VPS
  MongoDB reachable over the internet — a deployed app cannot reach
  `localhost` on a laptop. `render.yaml` in the repo root documents the
  (currently parked) Render blueprint for that day.
