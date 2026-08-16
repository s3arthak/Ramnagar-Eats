# Ramnagar Eats — Backlog

Everything that is pending, grouped by priority. Companion to [docs/STATUS.md](./STATUS.md) (what is done + service audit).

---

## P0 — Required before real production traffic

1. **Real payment gateway (Razorpay or Stripe)**
   - Only COD + a mock provider exist today. Add a `PaymentService` implementation for a real gateway (create order → verify webhook → mark PAID), keep COD, and gate the provider by env. **Deferred by the owner — do not touch until asked.** Needs credentials.
2. **Sender verification & deliverability (Brevo)**
   - SMTP delivery is live and verified (welcome email reached a Gmail inbox). Remaining: verify a real sender domain in Brevo and set `EMAIL_FROM` to it so emails don't get spam-filtered; confirm order/status emails arrive too.
3. **Google OAuth app**
   - Create a Google Cloud OAuth app (web), set `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REDIRECT_URI`, add the callback URL, and test the full round trip (not just the dev-callback). **Envs are added by the owner.**
4. *(resolved — ImageKit CDN is live: upload → CDN delivery → delete verified end-to-end with real keys)*

## P1 — Correctness & trust

5. **Pincode ↔ coordinates cross-check**
   - Pincode format is now validated (6-digit Indian PIN, backend + location sheet), but the pincode is not yet cross-checked against the map/GPS point. Add a pincode→lat/lng lookup (needs a geocoding service or a postal database) so users can't claim an in-area pincode with an out-of-area map pin (or vice versa).
6. **Payment status honesty**
   - COD is stored as PENDING with no settlement tracking; document the intended settlement flow (manual mark-paid vs gateway) before real COD usage.

## P2 — Product gaps

7. **Multiple service areas / cities** — the platform is single-area by design; model multiple areas and pick per-user, then generalize the seed and the admin UI.
8. **Branded email templates** — only the OTP email has HTML; make consistent branded templates (welcome, confirmation, status, cancelled).
9. **Search improvements** — text search is simple substring matching; add ranking (relevance, rating, distance) and typo tolerance.
10. **Restaurant analytics** — dashboard is live stats only; add trends (orders/revenue by day), popular items, and CSV export for admins.
11. **Push / in-app notifications for customers** — status changes are socket-only while the app is open; no push when closed.
12. **i18n** — English only; prepare string tables if Hindi/Marathi support is planned.
13. **Customer support / cancellation self-service** — cancellation exists; add refund tracking UI and a support contact path.
14. **PWA** — no offline support or installability.

## P3 — Dynamic configuration (stop hardcoding)

15. **Homepage marketing copy** — hero headline/subcopy and the "30 min delivery" chip are hardcoded; expose as admin-editable content (simple CMS or config).
16. **Phone dialing localization** — bare 10-digit numbers are now auto-normalized via `PHONE_COUNTRY_CODE` (default `91`), but there is no per-locale country-code selection for non-Indian numbers.
17. **Google Fonts** — self-host DM Sans to remove the runtime dependency.

## P4 — Ops & tooling

18. **Browser E2E in CI** — the 64-check walk runs locally only; add a job that boots the Docker stack and drives Edge (Playwright) end-to-end.
19. **MongoDB backup strategy** — no documented backup/restore for the production volume.
20. **Observability** — structured logs + health endpoint only; add request metrics, error tracking (Sentry), and uptime monitoring.
21. **Secret management** — env vars in compose; evaluate a secrets manager or at minimum a documented rotation process.
22. **Dependency updates** — pin and schedule updates for npm packages and base images (Dependabot/Renovate).

---

## Recently completed (moved out of the backlog)

- **Admin coupon management** — full CRUD API (`/admin/coupons`) + admin panel "Coupons" tab (create, pause/activate, delete, usage stats). Covered by API tests.
- **Seed for production** — `seed` service in `docker-compose.yml` (`docker compose up seed`) seeds demo accounts, restaurants, menu, coupons, service area on a fresh deploy.
- **SMTP provider** — NodeMailer SMTP delivery implemented (`SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS` + `OTP_DELIVERY=smtp`) and **verified with a real send** to a Gmail inbox via Brevo's relay. Stale vars were also removed from `docker-compose.dev.yml`.
- **OTP expiry copy** — emails now derive the expiry text from the configured `OTP_TTL_MS` instead of hardcoding "5 minutes".
- **Currency symbol** — config-driven (`CURRENCY_SYMBOL`, default `₹`), consumed by backend emails, `/config`, and both apps' `inr()` formatters.
- **Order-number prefix** — config-driven (`ORDER_PREFIX`, default `RE-`).
- **App brand name** — config-driven (`BRAND_NAME`); used in emails and exposed via `GET /api/v1/config`. The frontend logo stays a static design element.
- **Default map position** — the location sheet now loads the service center from `/config` instead of a hardcoded `[19.076, 72.8777]`.
- **Pincode format validation** — 6-digit Indian PIN enforced on the backend (addresses + service area) and in the location sheet UI.
- **Phone number UX** — bare 10-digit numbers (e.g. `6006949465`) are now auto-normalized to E.164 (`+916006949465`) instead of failing with a generic "Something went wrong"; invalid numbers return a friendly 400. Applied to registration and profile updates.
- **ImageKit CDN** — real keys set; uploads now go to the CDN. Verified end-to-end: upload via the app's provider, served from `ik.imagekit.io`, delete confirmed.
