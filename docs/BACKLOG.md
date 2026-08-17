# Ramnagar Eats — Backlog & Roadmap

Everything pending, grouped by theme and priority. Companion docs: `docs/PROJECT.md` (current
state) and `CLAUDE.md` (agent rules). Items marked **P0** block real production traffic.

---

## A. Performance & latency (the big one — images, OTP, API)

> Guiding numbers: API p50 < 150 ms, p95 < 500 ms; DB queries < 100 ms; first meaningful paint
> < 2 s on 4G. Measure before and after every change — no guessing.

### A1. Image loading (biggest visible win)
- **Serve every image through ImageKit transforms** (auto WebP/AVIF, `q`, `w`) instead of raw
  uploads. One helper (`ik(imageUrl, {w, h})`) in both apps; verify via the browser network tab.
- **srcset + sizes** on restaurant cards, menu items, covers (e.g. 300/600/900 px) so phones
  download ~⅓ the bytes.
- **`loading="lazy"` + `decoding="async"`** on all below-the-fold images; `fetchpriority="high"`
  on the first restaurant cover and the hero.
- **Preload the first screen's cover images** (`<link rel="preload" as="image">` from the API
  response) so cards paint before the JS waterfall.
- **Placeholder shimmer**: tiny blurred placeholder (blur-up) via ImageKit `blur=10` for the
  card grid; keeps the layout stable while loading.
- **Seed images**: currently real Unsplash CDN photos (verified, deterministic). Consider moving
  them to ImageKit-hosted copies for resize/optimization + no external dependency.

### A2. OTP & email
- **Async email send with a background job**: `send-otp` currently awaits the SMTP/Brevo call.
  Move the send off the request path (in-process queue, retried once) so `/auth/send-otp`
  returns < 200 ms; the code is still created+hashed synchronously so login never waits on mail.
  Keep the 15 s bounded timeout as a last line of defense.
- **OTP delivery status endpoint** (dev): return `sent`/`failed` so the UI can say
  "Email delayed — check spam" instead of silently failing.
- **Bulk/order emails**: fire-and-forget with a small retry/backoff (welcome, confirmation,
  status, cancellation) — never on the critical order-creation path.
- **Brevo webhook** for delivery/bounce tracking → surface undeliverable addresses early.

### A3. API & database
- **Restaurant list**: already geo-indexed + projected. Next: cache the (center, radius,
  filters) hot page for 30–60 s (in-memory, invalidated on service-area/menu change) — it's the
  home-page query and the most-hit endpoint.
- **Menu endpoint**: group in one pass (done) and add a **cache per restaurant** (TTL 60 s,
  bust on menu edit) — restaurant pages are the second-hottest view.
- **Index audit**: run `explain()` on `/orders` (customer), `/restaurant/orders` (queue),
  `/admin/*`, and the reviews aggregation; add missing compound indexes; drop unused ones.
- **Pagination everywhere**: admin lists, reviews, notifications — never load-all.
- **Keep-alive + compression**: enable gzip/brotli on Express; confirm Render's proxy headers
  (`trust proxy`) for accurate rate limits + logging.
- **DB projection on detail pages** (orders, admin) — stop returning full documents when the
  DTO uses a subset.
- **HTTP caching headers** for `/config`, `/categories` (they change rarely) — `Cache-Control:
  public, max-age=60` + revalidate.

### A4. Frontend bundle & startup
- **Already done**: route-level `React.lazy`, Leaflet isolated in its own chunk (both apps).
- Next: **preload the two most-likely chunks** after first paint (restaurant page, search);
  **modulepreload** critical chunks; **split lucide-react** imports to named icons only.
- **Fonts**: self-host DM Sans (`font-display: swap`), remove the Google Fonts runtime request.
- **Reduce TBT**: chunk the `menu-preview` drawer and cart drawer components; profile with
  Lighthouse (target < 3.5 s TBT mobile).

### A5. Observability & ops
- **Structured request log already has req-id + duration + user-id** — add a `/metrics`
  endpoint (p50/p95 per route over the last 5 min, in-memory ring buffer) for cheap dashboards.
- **Sentry or similar** for production error tracking (P0 before real users).
- **MongoDB TTL + retention**: notifications (future), OTPs already expire; add a cleanup job
  for old orders/feedbacks per product policy.
- **Automated Atlas backup** (daily snapshot or `mongodump` job) — the manual backup script
  exists (`backend/scripts/backup-atlas.ts`); schedule it.

---

## B. UI & UX — polish, motion, engagement

### B1. Micro-interactions (cheap, high impact)
- **Add-to-cart fly animation**: the cart badge pulses; the item "flies" toward the bag
  (30-line CSS transform — no library).
- **Order status transitions**: timeline dots pop + checkmark draw-in when a status arrives
  over the socket (CSS transitions only).
- **Skeleton screens**: replace the raw "loading…" text with shimmer skeletons for restaurant
  cards, menu items, and the tracking page.
- **Toast design**: keep the single toast system; add success/error icons + subtle slide-in
  (already exists — standardize tones).
- **Button states**: pressed scale `transform: scale(.97)` on all primary CTAs; disabled states
  with a spinner for async actions.

### B2. Copy that converts (engagement)
- **Hero**: dynamic, config-driven headline + subcopy (currently hardcoded) — A/B variants like
  "Your neighbourhood, delivered" vs "Ramnagar's kitchens, at your door".
- **Empty states**: cart, orders, addresses, search — each with an emoji, a one-liner, and a
  single CTA ("Hungry? Find something good →").
- **Restaurant cards**: show "Order again" for repeat restaurants; highlight "X people ordered
  this today" using live counts.
- **Checkout trust line**: "Fresh · Verified kitchen · Live tracking" badges above the pay
  button; time-window promise ("Arrives by 8:42 PM").
- **Post-order delight**: order success shows the live ETA countdown + "What's next?" steps;
  delivery-complete asks "How was it?" with emoji ratings (1-tap).

### B3. Responsive & accessibility
- **Bottom-sheet checkout on mobile** (instead of the full page) to cut taps.
- **Sticky "View cart" bar** while scrolling a restaurant menu on phones (shows total + items).
- **Touch targets ≥ 44 px** audit on all icon buttons (close, qty, filters).
- **Keyboard focus rings + ARIA** pass on modals, drawers, and the location sheet.
- **Dark mode** (CSS variables already in place) — optional theme toggle, persisted.
- **Reduced-motion**: respect `prefers-reduced-motion` for all new animations.

### B4. Trust & social proof
- **Photo reviews**: customers attach up to 3 food photos with the star rating (upload endpoint
  exists — reuse it); restaurant page shows photo grid.
- **"What's popular" per restaurant**: top-3 recommended items surfaced from live order data
  (already tagged `isRecommended` — make it data-driven).
- **Live order count on cards**: "13 orders placed in the last hour" from an indexed count.
- **Verified badge** for restaurants with photos + complete profiles.

---

## C. Startup-grade features

### C1. Growth & retention
- **Web Push notifications** (free, VAPID + service worker) — the plan doc's Phase 3: subscribe,
  notify on status changes even with the app closed, deep-link to the order. Backend model +
  notification center (`GET /notifications`, read/unread) included.
- **Favorites / reorder**: "Save this restaurant" + one-tap reorder of a past order.
- **Referral + first-order codes**: referral link → `FRIEND20` coupon on first order; track
  attribution server-side.
- **Loyalty**: "Earn ₹10 back per order" wallet credit shown at checkout (starts as a balance
  field on the user; settlement rules documented first).
- **Scheduled/advance ordering** for restaurants that accept it.
- **SMS OTP fallback** (MSG91/Twilio) — keep email as primary; SMS for phone-first signup later.

### C2. Restaurant partner tools
- **Analytics**: daily/weekly revenue, orders, popular items, and **CSV export** for the owner
  dashboard (currently today-only stats).
- **Order tickets + printer-friendly view** for the kitchen.
- **Menu bulk editor** (paste CSV / edit multiple items), **duplicate item**, **reorder
  categories by drag**.
- **Smart availability**: auto-pause when busy (owner toggle with a reason shown to customers).

### C3. Trust & payments
- **Real payment gateway** (Razorpay first — UPI/cards/NetBanking; Stripe for international).
  The `PaymentProvider` interface is ready; add webhook → order status mapping + settlement docs.
- **Payment honesty**: COD stays `PENDING` until marked paid; build the manual settle UI +
  refund flow before real COD volume.
- **Pincode ↔ coordinates cross-check**: geocode the typed pincode and compare with the map
  pin; warn on mismatch (needs a pincode/postal source).
- **Order support**: in-app "Help" on the tracking page → issue categories (missing items,
  refund, late) that notify the restaurant + admin; refund tracking UI.

### C4. Scale & platform
- **Multiple service areas/cities**: generalize `serviceareas` (currently single) — per-city
  center/radius, per-area restaurant assignment, pick-area UX.
- **Search ranking**: relevance scoring (name > cuisines > description), typo tolerance
  (trigram index or a light tokenizer), sort by "Best match".
- **i18n**: string tables for Hindi (and Dogri?) — start with the customer-facing copy.
- **PWA**: manifest + icons + service worker offline shell; push (C1) works with it.
- **Admin suite**: restaurant approval queue with photos, coupon analytics (usage/redemption),
  and a revenue export.

### C5. Reliability & security (P0-leaning)
- **Rate-limit by IP + account** on OTP and order endpoints (already partially covered) —
  verify limits hold behind Render's proxy.
- **Order idempotency audit**: ensure retried webhooks/requests can never double-charge or
  double-notify (keys exist — add a test for the double-delivery case).
- **Secrets rotation**: document a JWT/ImageKit/Brevo rotation runbook; move Render env to a
  secrets manager when the team grows.
- **Dependency updates**: Dependabot monthly; pin base Docker images.
- **Browser E2E in CI**: boot the Docker stack in a GitHub Actions job and run the walk
  automatically (currently local-only).

---

## Recently completed (moved out)

- ✅ Accurate current-location flow (customer + restaurant): high-accuracy GPS, accuracy
  display, reverse-geocode autofill, emoji marker, pan-to-fix, permission-denied UX.
- ✅ Restaurant location picker on the profile page (map + GPS + draggable marker).
- ✅ Ramnagar service area + 12 real restaurants with real food images in Atlas (backup +
  `--restaurants-only` reseed).
- ✅ Restaurant list geo-indexed, projected, correct pagination; reviews per-star aggregation;
  menu single-pass grouping; compound order indexes; req-id logging.
- ✅ Route-level code splitting + lazy Leaflet in both apps.
- ✅ Bounded (15 s) email timeouts so OTP failures surface fast.
- ✅ Env alignment: `OTP_DELIVERY` everywhere, Ramnagar defaults, `.env.production.example` in
  sync, `render.yaml` complete.
