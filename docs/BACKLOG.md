# Ramnagar Eats — Backlog

Everything that is pending, grouped by priority. Companion to [docs/STATUS.md](./STATUS.md).

---

## P0 — Required before real production traffic

1. **Real payment gateway (Razorpay or Stripe)**
   - Only COD + a mock provider exist today. Add a `PaymentService` implementation for a real gateway (create order → verify webhook → mark PAID), keep COD, and gate the provider by env. **Needs credentials.**
2. **Real email delivery (Brevo)**
   - Provider is written and tested against the real API; set `BREVO_API_KEY`, verify the sender domain, and switch `OTP_DELIVERY` away from `console`. Confirm welcome/order/status emails actually arrive.
3. **Google OAuth app**
   - Create a Google Cloud OAuth app (web), set `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REDIRECT_URI`, add the callback URL, and test the full round trip (not just the dev-callback).
4. **ImageKit keys**
   - Set `IMAGEKIT_PUBLIC_KEY` / `IMAGEKIT_PRIVATE_KEY` / `IMAGEKIT_URL_ENDPOINT` to move uploads off local disk onto the CDN; verify upload + delete + delivery.
5. **Seed data for production**
   - The Docker stack boots empty — add a seed step/service so the first deploy has restaurants, menu, coupons, and the admin account.
6. **SMTP inconsistency**
   - `docker-compose.dev.yml` sets `SMTP_HOST`/`SMTP_PORT` but the email service has **no SMTP provider** (only Console + Brevo). Either implement an SMTP provider (NodeMailer) or remove the stale env vars.

## P1 — Correctness & trust

7. **Pincode ↔ coordinates validation**
   - Pincode is free text and never checked against the map point. Add a pincode→lat/lng lookup (or a consistency check) so users can't claim an out-of-area pincode with an in-area map pin.
8. **OTP expiry copy matches config**
   - Emails say "expires in 5 minutes" but `OTP_TTL_MS` is configurable. Generate the copy from the configured TTL.
9. **Payment status honesty**
   - COD is stored as PENDING with no settlement tracking; document the intended settlement flow (manual mark-paid vs gateway) before real COD usage.

## P2 — Product gaps

10. **Admin coupon management** — coupons are seeded only; add create/edit/deactivate + usage stats in the admin panel.
11. **Multiple service areas / cities** — the platform is single-area by design; model multiple areas and pick per-user, then generalize the seed and the admin UI.
12. **Branded email templates** — only the OTP email has HTML; make consistent branded templates (welcome, confirmation, status, cancelled).
13. **Search improvements** — text search is simple substring matching; add ranking (relevance, rating, distance) and typo tolerance.
14. **Restaurant analytics** — dashboard is live stats only; add trends (orders/revenue by day), popular items, and CSV export for admins.
15. **Push / in-app notifications for customers** — status changes are socket-only while the app is open; no push when closed.
16. **i18n** — English only; prepare string tables if Hindi/Marathi support is planned.
17. **Customer support / cancellation self-service** — cancellation exists; add refund tracking UI and a support contact path.
18. **PWA** — no offline support or installability.

## P3 — Dynamic configuration (stop hardcoding)

19. **Currency symbol** — `₹` is hardcoded in 11 backend spots + the frontend `inr()` formatter; make it a config value (default INR).
20. **Order-number prefix** — `RE-` is hardcoded in `orders/routes.ts`; make it configurable.
21. **App brand name** — "Ramnagar Eats" is repeated across UI and emails; centralize into one brand config consumed by both apps + the backend.
22. **Homepage marketing copy** — hero headline/subcopy and the "30 min delivery" chip are hardcoded; expose as admin-editable content (simple CMS or config).
23. **Default map position** — `[19.076, 72.8777]` is hardcoded in the location sheet; load the service center from `/config` so a new city works without a code change.
24. **Phone placeholder / dialing defaults** — `+919876543210` is India-specific; derive from config or localization.
25. **Google Fonts** — self-host DM Sans to remove the runtime dependency.

## P4 — Ops & tooling

26. **Browser E2E in CI** — the 64-check walk runs locally only; add a job that boots the Docker stack and drives Edge (Playwright) end-to-end.
27. **MongoDB backup strategy** — no documented backup/restore for the production volume.
28. **Observability** — structured logs + health endpoint only; add request metrics, error tracking (Sentry), and uptime monitoring.
29. **Secret management** — env vars in compose; evaluate a secrets manager or at minimum a documented rotation process.
30. **Dependency updates** — pin and schedule updates for npm packages and base images (Dependabot/Renovate).
