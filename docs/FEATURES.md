# Ramnagar Eats — Feature List

Every feature in the platform, explained in plain English. No code.

> **Project status:** see [STATUS.md](./STATUS.md) (what is done vs not, with per-service test evidence) and [BACKLOG.md](./BACKLOG.md) (everything pending).

---

## 1. Authentication (Phone + OTP, no passwords)

- **OTP login** — Users sign in with their mobile number. A 6-digit code is sent to the phone; entering the correct code signs them in. There are no passwords anywhere in the platform.
- **New-user registration** — A phone number that has never been used gets the OTP first, then asks for the person's name and an optional email. The account is created only after the phone is verified.
- **Returning-user login** — Existing users only enter their phone and the OTP. They are never asked for their name or email again.
- **OTP expiry** — Codes expire after 5 minutes. An expired code shows a clear "code expired, request a new one" message.
- **Resend with timer** — A "Resend code in Xs" countdown appears after sending; users can request a fresh code once the timer ends.
- **Resend rate limit** — Requesting a new code too quickly (within 60 seconds) is rejected with a friendly "please wait" message.
- **Attempt lockout** — After 5 wrong codes, the code is locked and the user must request a new one.
- **OTP reuse prevention** — A code that has already been used to sign in can never be used again.
- **Wrong-code handling** — An incorrect code shows "Incorrect code. Please check and try again."
- **Change phone number** — On the code screen, users can go back and enter a different number.
- **Duplicate phone protection** — The same phone number cannot create two accounts.
- **Role control by the server** — New accounts are always created as CUSTOMER. The client can never create an ADMIN account. The restaurant app creates RESTAURANT accounts; only the server decides roles.
- **Secure code storage** — OTP codes are never stored in plain text and are never returned by the API. In development, codes appear in the server log and through a development-only helper endpoint that is compiled out in production.
- **Session persistence** — A signed session token keeps the user logged in across page refreshes and browser restarts.
- **Session expiry** — Expired or invalid sessions are rejected and the user is asked to sign in again.
- **Logout** — Signing out clears the session from the browser.

## 2. Location & Delivery Area

- **Location gate on first visit** — New visitors are asked "Where should we bring your food?" before browsing.
- **Use my current location** — One tap uses the browser's GPS; if GPS is denied, unavailable, or times out, a friendly message suggests entering a pincode instead.
- **Map with draggable pin** — Users see a map (OpenStreetMap/Leaflet) and can drag the pin or tap the map to fine-tune their exact delivery point.
- **Pincode entry** — Users can type a pincode instead of using GPS.
- **Service-area check on location** — When a location is confirmed, the backend calculates the distance from the service center. Inside the radius: browsing continues. Outside: a clear message says "Sorry, we don't deliver here yet — you're X km away (max Y km)" and the sheet stays open for a different location.
- **Admin-controlled service area** — The admin panel holds the delivery center (latitude, longitude, address, pincode) and the delivery radius (default 10 km). The admin can change it at any time and it takes effect immediately.
- **Backend is the authority** — The radius rule is enforced by the backend, not the browser. The check runs at location selection, restaurant listing, checkout, and again at final order creation, so nobody can bypass it by calling the API directly.
- **Out-of-area orders blocked** — An order to an address outside the delivery area is rejected by the server with a clear message, and the checkout screen flags such addresses with "Outside our delivery area".

## 3. Customer Home Page

- **Sticky top navigation** — Logo, delivery-location button, search, account menu, and cart bag stay visible while scrolling.
- **Hero search** — A large "Search for restaurants, dishes…" input. Searching shows matching restaurants (names, cuisines, descriptions) with a result count.
- **Cuisine category cards** — Tappable cards for cuisines (Biryani, Pizza, Burgers, North Indian, Chinese, etc.) that jump to the filtered listing.
- **Restaurant sections** — Popular restaurants and other curated sections on the homepage.
- **Restaurant cards** — Every card shows the restaurant image, name, rating, cuisines, delivery time range, price-for-two, veg/non-veg badge where applicable, open/closed status, offers/discount badges, and distance.
- **Skeleton loading** — Placeholder shimmer cards while restaurant data loads.
- **Error & retry** — If the API fails, a clear error state with a retry button appears.
- **Empty states** — "No restaurants found" style messages when nothing matches.
- **Responsive layout** — Cards collapse to a single column on phones; tested at 390 px with no horizontal overflow.

## 4. Restaurant Listing Page (`/restaurants`)

- **Search** — Same text search as the homepage.
- **Filters** — By cuisine, minimum rating, vegetarian-only, maximum delivery time, and price-for-two. Filter choices live in the URL, so a filtered view can be bookmarked or shared.
- **Sorting** — By rating, delivery time, or relevance.
- **Pagination** — Controlled page-by-page loading.
- **Restaurant cards reused** — The exact same card component as the homepage.

## 5. Restaurant Detail & Menu (`/restaurant/:id`)

- **Restaurant header** — Cover image, logo, name, rating, cuisines, address, delivery estimate, minimum order, open/closed status, and offers.
- **Menu categories** — The menu is fetched from the API and grouped into categories (Biryani, Starters, Breads & Sides, etc.).
- **Menu items** — Each item shows an image, name, description, price, veg indicator, popular badge, and availability.
- **Dish search within the restaurant** — Type to filter the items instantly.
- **Sticky category navigation** — Category names stay pinned while scrolling so you always know where you are.
- **Add to cart** — A "+" button adds an item to the cart with a toast confirmation.
- **Quantity controls** — Add/remove buttons on the item itself update the quantity directly.
- **Item customization** — Items with customization options (e.g., spice level, add-ons like extra cheese) open a sheet where each required group must be chosen and optional add-ons can be selected; the price updates with the selections.
- **Disabled adds when closed** — If the restaurant is closed, add buttons are disabled.
- **Mobile cart bar** — On phones, a sticky bar shows the cart total and item count for jumping to the cart.

## 6. Cart

- **Add / remove / quantity** — Items can be added, removed, and have quantities increased or decreased.
- **Customizations in the cart** — Selected options (e.g., "Extra cheese") travel with the item and appear in the cart.
- **Single-restaurant rule** — A cart can only hold items from one restaurant. Adding from another restaurant asks: "Your cart contains items from X. Clear cart and add items from Y?" — the cart is never silently replaced.
- **Persistence** — The cart survives page refreshes and browser restarts (saved locally).
- **Cart drawer (desktop)** — A slide-in drawer shows the current items, quantity controls, price breakdown, and a "View cart / Checkout" button.
- **Full cart page (`/cart`)** — A dedicated page with the same components.
- **Price breakdown** — Item subtotal, delivery fee, discount, and total, all shown clearly.
- **Free-delivery progress bar** — When free delivery is available above a threshold, a progress bar shows how much more to add to unlock it.
- **Empty cart state** — A friendly "Your cart is empty" view with a browse button.
- **Restaurant header in cart** — Shows which restaurant the cart belongs to.

## 7. Addresses (`/addresses`)

- **Add / edit / delete addresses** — Full CRUD on saved addresses.
- **Address fields** — Label (Home / Work / Other), full address, pincode, city, state, locality/area, latitude, longitude, and delivery instructions (e.g., "ring twice").
- **Default address** — One address can be marked default; setting a new default switches it automatically.
- **Use current location** — The address form can fill coordinates from GPS.
- **Toast feedback** — Saving, deleting, and changing the default show success toasts; failures show error toasts.

## 8. Checkout (`/checkout`)

- **Login required** — Checkout redirects to sign-in if the user isn't logged in, and returns them to checkout after signing in.
- **Address selection** — Choose from saved addresses; addresses outside the delivery area are flagged and cannot be used.
- **Order summary** — The restaurant, items, quantities, and an optional delivery note for the restaurant.
- **Coupon rack** — Shows coupons available for this user and restaurant; tap one to apply it.
- **Coupon apply** — Entering a code validates it against the backend (expiry, minimum order, restaurant scope, user usage limits) before applying. The discount is shown in the breakdown.
- **Payment method** — Cash on Delivery or a mock card/UPI option for local testing.
- **Complete price breakdown** — Item total, discount, delivery fee, and total.
- **Place order** — The server re-fetches the menu, re-verifies prices and availability, checks the restaurant is open, re-checks the delivery area, applies the coupon itself, and calculates the final amount. The frontend total is never trusted.

## 9. Orders & Tracking

- **Order confirmation page** — After placing an order, a success screen shows the order number, restaurant, items, amount, delivery address, payment method, and estimated delivery time.
- **Order history (`/orders`)** — Every past order with restaurant, order number, date/time, item summary, total, and status.
- **Order detail & timeline (`/orders/:id`)** — A visual timeline: Order placed → Restaurant confirmed → Food preparing → Ready → Out for delivery → Delivered, with timestamps for each step.
- **Real-time updates** — Status changes appear instantly over a live socket connection; a light polling fallback keeps the page correct if the socket drops.
- **Reorder** — Re-add the items from a past order to the cart in one tap.
- **Cancel where allowed** — Orders can be cancelled while still in the allowed stage (placed/confirmed); delivered orders cannot be cancelled.
- **Duplicate-submission protection** — Double-clicking "Place order" cannot create two orders (idempotency keys).

## 10. Restaurant App (Restaurant Dashboard)

- **OTP login for owners** — Restaurant owners and admins sign in with phone + OTP, no passwords.
- **Dashboard** — Live cards for new/pending orders, active orders, today's revenue, and restaurant status.
- **Live order queue** — New orders appear in real time with a "🔔 New order" toast; no refresh needed.
- **Order details** — Each order shows the customer name, items with quantities and customizations, delivery address, payment type, and total.
- **Accept / Reject** — A new order can be accepted or rejected.
- **Status flow** — Accept → Start preparing → Mark ready → Out for delivery → Mark delivered, with each step validated so invalid transitions are impossible.
- **Open / close toggle** — The restaurant can open or close itself; customers instantly see the status.
- **Menu management** — Add, edit, delete, and reorder categories; add, edit, delete menu items; change price, image, description, veg flag, and popularity; mark items available/unavailable.
- **Profile management** — Edit the restaurant's name, description, phone, address, logo/cover images, cuisines, and minimum order.

## 11. Admin Panel (in the Restaurant App at `/admin`)

- **Metrics dashboard** — Total orders, today's orders, active orders, restaurants, customers, and revenue.
- **Restaurant management** — View all restaurants with owners; approve or disable any restaurant.
- **User management** — View all customers and restaurant owners with their contact details and roles.
- **Order management** — View every order platform-wide and drill into order details.
- **Service area settings** — Edit the delivery center (lat/lng, address, pincode) and radius; the change is enforced by the backend immediately.

## 12. Offers & Coupons

- **Coupon engine** — Percentage and flat discounts with configurable minimum order, maximum discount, restaurant scope, usage limits, per-user limits, validity window, and active flag.
- **Backend validation** — Every coupon is validated server-side: expiry, minimum order, restaurant eligibility, user eligibility, usage limits, and duplicate use. Frontend-entered discounts are never trusted.
- **Coupon rack** — The checkout lists coupons the user can actually use (used/expired/out-of-scope ones are hidden).

## 13. Notifications & Email

- **In-app toasts** — Success/error/info toasts for key actions (code sent, signed in, added to cart, coupon applied, address saved, order placed, new order for restaurants).
- **Email service abstraction** — A replaceable transactional email layer with a development provider that prints to the server log (so no paid service is needed locally).
- **Welcome email** — Sent when a new account is created.
- **Order confirmation email** — Sent when an order is placed (if the customer supplied an email).

## 14. Real-Time Order Flow (Socket.IO)

- **Live new-order alerts for restaurants** — The order queue updates the instant a customer orders, with a toast.
- **Live status propagation to customers** — The tracking timeline updates the instant the restaurant changes status — no page reload.
- **Authenticated sockets** — Socket connections are authenticated with the same session token; anonymous connections are rejected.
- **Graceful degradation** — If the socket drops, polling keeps the state correct, and the page refetches the current order on reconnect.

## 15. Security & Hardening

- **OTP security** — Codes are hashed, expire, have attempt limits and resend cooldowns, and are never returned by the API.
- **Rate limiting** — General API limits (300 requests/min/IP) and stricter auth limits (10 attempts/min/IP; successful logins don't count).
- **Security headers** — Helmet adds CSP, HSTS, nosniff, and frame-protection headers to every response.
- **CORS allowlist** — Only configured origins can call the API.
- **Request validation** — Every API body and query is validated; invalid input gets a consistent, friendly error.
- **Role-based access control** — CUSTOMER, RESTAURANT, and ADMIN roles gate every protected route; a customer cannot reach owner or admin endpoints.
- **Server-authoritative pricing** — Prices, discounts, fees, and totals are always recalculated from the database at order time.
- **No secrets in the frontend** — API keys and secrets exist only on the server.
- **No sensitive info in responses** — Errors are consistent (`{success, message, code}`) with no stack traces or database internals leaked.
- **Graceful shutdown** — The server closes cleanly on shutdown signals, disconnecting the database safely.
- **Structured logging** — Every request is logged with method, path, status, and duration.

## 16. Platform-Wide UX Standards

- **Loading states** — Skeleton placeholders and spinners everywhere data loads.
- **Empty states** — Friendly, actionable empty views on every list page.
- **Error states** — Clear messages with retry buttons where appropriate.
- **Success feedback** — Toasts and confirmation screens for completed actions.
- **Responsive design** — Mobile-first layouts for customers; desktop-focused but responsive dashboards for restaurant staff; tested from 390 px phones up to large desktops with no horizontal overflow, clipped content, or broken modals.
- **Consistent design system** — Shared color tokens, buttons, cards, badges, quantity selectors, restaurant/menu cards, and state views reused across both apps.
