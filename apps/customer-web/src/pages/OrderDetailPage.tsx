import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Bike, Check, ChefHat, MapPin, Navigation, Package, Phone, ShoppingCart, Star, User, Wallet } from "lucide-react";
// Map (via the map chunk) is pulled in only once an order has a route to draw.
const RouteMap = lazy(() => import("../components/RouteMap"));
import { api } from "../lib/api";
import { formatDateTime, inr, timeAgo } from "../lib/format";
import { isActive, isCancelable, STATUS_LABELS, statusTone, TIMELINE } from "../lib/order";
import type { Order, OrderRoute } from "../lib/types";
import { getSocket } from "../lib/socket";
import { PriceBreakdown } from "../components/cart";
import { ErrorState } from "../components/ui/StateViews";
import { Spinner } from "../components/ui/Skeleton";
import { useToast } from "../context/ToastContext";

/** Toast shown to the customer when the order moves to a new status (in-app notification). */
const STATUS_NOTIFY: Partial<Record<string, { title: string; body?: string }>> = {
  CONFIRMED: { title: "✅ Restaurant accepted your order", body: "The kitchen is getting ready for you." },
  PREPARING: { title: "👨‍🍳 Your food is being prepared" },
  READY: { title: "📦 Your order is ready — waiting for rider" },
  RIDER_ASSIGNED: { title: "🛵 A rider has been assigned" },
  RIDER_ACCEPTED: { title: "🛵 Rider is heading to the restaurant" },
  PICKED_UP: { title: "🛵 Your order is out for delivery" },
  OUT_FOR_DELIVERY: { title: "🛵 Your rider is on the way" },
  DELIVERED: { title: "🎉 Order delivered — enjoy!" },
  CANCELLED: { title: "This order was cancelled" },
};

/** Icons for each tracking stage — keeps the timeline visual and consistent. */
const STAGE_ICONS: Record<string, React.ReactNode> = {
  PLACED: <ShoppingCart size={14} />,
  CONFIRMED: <Check size={14} />,
  PREPARING: <ChefHat size={14} />,
  READY: <Package size={14} />,
  RIDER_ASSIGNED: <Bike size={14} />,
  RIDER_ACCEPTED: <Bike size={14} />,
  PICKED_UP: <Bike size={14} />,
  OUT_FOR_DELIVERY: <Bike size={14} />,
  DELIVERED: <Check size={14} />,
};

/** Minutes remaining until `at`, ticking every 30s so the ETA stays live. */
function useMinutesUntil(at?: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!at) return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [at]);
  if (!at) return null;
  return Math.max(0, Math.ceil((new Date(at).getTime() - now) / 60_000));
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [feedback, setFeedback] = useState<{ rating: number; comment: string } | null>(null);
  const [routeInfo, setRouteInfo] = useState<OrderRoute | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [riderLocation, setRiderLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { push } = useToast();

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ order: Order; feedback?: { rating: number; comment: string } | null }>(`/orders/${id}`);
      setOrder(data.order);
      setFeedback(data.feedback ?? null);
      setError("");
      // Route + dynamic ETA — the server caches the route, so this stays cheap on polling.
      setRouteLoading(true);
      api
        .get<OrderRoute>(`/orders/${id}/route`)
        .then(setRouteInfo)
        .catch(() => setRouteInfo(null))
        .finally(() => setRouteLoading(false));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load this order");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
    // Live updates via socket; polling remains as a fallback while the order is active.
    const handleUpdate = (payload: { order: Order }) => {
      if (payload.order.id !== id) return;
      const previous = order?.status;
      if (previous && previous !== payload.order.status) {
        const notice = STATUS_NOTIFY[payload.order.status];
        if (notice) push(notice.title, { body: notice.body, tone: "success" });
      }
      setOrder(payload.order);
    };
    const socket = getSocket();
    socket.on("order:updated", handleUpdate);
    socket.on("rider:location", (payload: { latitude: number; longitude: number }) => {
      setRiderLocation({ lat: payload.latitude, lng: payload.longitude });
    });
    const timer = setInterval(() => {
      if (!isActive(order?.status ?? "PLACED")) return;
      void load();
    }, 8000);
    return () => {
      socket.off("order:updated", handleUpdate);
      socket.off("rider:location");
      clearInterval(timer);
    };
  }, [load, order?.status, id]);

  const etaAt = routeInfo?.eta?.at ?? order?.estimatedDeliveryAt ?? null;
  const etaMinutes = useMinutesUntil(etaAt);
  const etaMessage =
    order && etaAt && isActive(order.status)
      ? etaMinutes !== null && etaMinutes > 0
        ? etaMinutes <= 1
          ? "Arriving in under a minute"
          : `Arriving in approximately ${etaMinutes} min`
        : "Arriving shortly"
      : null;

  async function cancel() {
    if (!order) return;
    setCancelling(true);
    try {
      const data = await api.patch<{ order: Order }>(`/orders/${order.id}/cancel`);
      setOrder(data.order);
      push("Order cancelled", { tone: "info" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not cancel this order");
    } finally {
      setCancelling(false);
    }
  }

  async function submitFeedback() {
    if (!order || rating === 0) return;
    setSubmitting(true);
    try {
      await api.post(`/orders/${order.id}/feedback`, { rating, comment: comment.trim() });
      setFeedback({ rating, comment: comment.trim() });
      push("Thanks for rating this order! 🎉", { tone: "success" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not submit your rating");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="content">
        <Spinner label="Loading order…" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="content page">
        <ErrorState message={error || "Order not found"} onRetry={() => void load()} />
      </div>
    );
  }

  const activeIndex = TIMELINE.indexOf(order.status === "CANCELLED" ? "PLACED" : order.status);
  const historyMap = new Map(order.statusHistory.map((entry) => [entry.status, entry.at]));
  const showFeedbackForm = order.status === "DELIVERED" && !feedback;

  return (
    <div className="content page order-detail">
      <Link to="/orders" className="back-link">
        <ArrowLeft size={16} /> All orders
      </Link>
      <div className="order-detail-head">
        <div>
          <p className="eyebrow">ORDER {order.orderNumber}</p>
          <h1>{order.restaurantName}</h1>
          <p className="listing-sub">
            Placed {formatDateTime(order.createdAt)} · {order.paymentMethod === "COD" ? "Cash on Delivery" : "Card / UPI (test)"}
          </p>
        </div>
        <span className={`status status--lg ${statusTone(order.status)}`}>{STATUS_LABELS[order.status]}</span>
      </div>

      {isCancelable(order.status) && (
        <div className="cancel-banner">
          <p>Changed your mind? You can cancel this order before the restaurant starts preparing it.</p>
          <button className="filter danger-btn" disabled={cancelling} onClick={() => void cancel()}>
            {cancelling ? "Cancelling…" : "Cancel order"}
          </button>
        </div>
      )}

      {/* Rider info */}
      {(order.riderName || order.riderPhone) && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid var(--saffron, #E8663C)' }}>
          <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1, color: 'var(--muted)', marginBottom: 6 }}>YOUR RIDER</p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <User size={18} color="var(--saffron, #E8663C)" />
              <span style={{ fontWeight: 800, fontSize: 15 }}>{order.riderName}</span>
            </div>
            {order.riderPhone && (
              <a href={`tel:${order.riderPhone}`} className="filter" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Phone size={14} /> {order.riderPhone}
              </a>
            )}
          </div>
        </div>
      )}

      <section className="tracking-card">
        <h2>Order status</h2>
        <ol className="timeline">
          {TIMELINE.map((status, index) => {
            const reached = order.status === "CANCELLED" ? index === 0 : index <= activeIndex;
            const current = index === activeIndex && order.status !== "CANCELLED";
            const at = historyMap.get(status);
            return (
              <li key={status} className={reached ? "done" : ""}>
                <span className={`timeline-dot ${current ? "current" : ""}`}>{STAGE_ICONS[status] ?? index + 1}</span>
                <div>
                  <b>{STATUS_LABELS[status]}</b>
                  {at && <small>{formatDateTime(at)}</small>}
                </div>
              </li>
            );
          })}
        </ol>
        {etaMessage && (
          <p className="timeline-eta" role="status">
            🛵 {etaMessage}
            {etaAt && <small>Estimated by {formatDateTime(etaAt)}</small>}
          </p>
        )}
        {order.deliveryOtp && (order.status === "PICKED_UP" || order.status === "OUT_FOR_DELIVERY") && (
          <div className="delivery-otp-card" style={{ marginTop: 16, padding: 16, background: "#f0fdf4", border: "2px solid #22c55e", borderRadius: 12, textAlign: "center" }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: "#16a34a" }}>🔒 Delivery Verification Code</p>
            <p style={{ margin: "8px 0 4px", fontSize: 32, fontWeight: 900, letterSpacing: 8, color: "#15803d" }}>{order.deliveryOtp}</p>
            <p style={{ margin: 0, fontSize: 13, color: "#666" }}>Share this code with the rider to confirm delivery</p>
          </div>
        )}
      </section>

      <section className="tracking-map-card">
        <div className="tracking-map-head">
          <h2>Delivery route</h2>
          {etaMessage && (
            <span className="route-eta-badge" role="status">
              🛵 {etaMessage}
            </span>
          )}
        </div>
        {routeLoading && !routeInfo ? (
          <Spinner label="Loading route…" />
        ) : routeInfo?.route && routeInfo.restaurant && routeInfo.delivery.location ? (
          <>
            <div className="tracking-map">
              <Suspense fallback={<div style={{ padding: 24, color: "var(--muted)", fontSize: 14 }}>Loading map…</div>}>
                <RouteMap routeInfo={routeInfo} riderLocation={riderLocation} />
              </Suspense>
            </div>
            <div className="route-facts">
              <span>🍴 {routeInfo.restaurant.name}</span>
              {routeInfo.eta?.distanceKm != null && <span>📏 {routeInfo.eta.distanceKm} km away</span>}
              {etaAt && <span>🕐 Arriving by {formatDateTime(etaAt)}</span>}
              <span>🏠 {order.deliveryAddress.formattedAddress}</span>
            </div>
          </>
        ) : (
          <p className="notice notice--muted">Route preview unavailable for this order.</p>
        )}
        {(routeInfo?.restaurant?.phone || order.deliveryAddress.formattedAddress) && (
          <div className="order-help-row">
            {routeInfo?.restaurant?.phone && (
              <a className="filter order-help-btn" href={`tel:${routeInfo.restaurant.phone}`}>
                <Phone size={15} /> Call {routeInfo.restaurant.name}
              </a>
            )}
            <a
              className="filter order-help-btn"
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(order.deliveryAddress.formattedAddress)}`}
              target="_blank"
              rel="noreferrer"
            >
              <Navigation size={15} /> Get directions
            </a>
            <span className="order-help-hint">Need help? Call the restaurant or navigate to your delivery address.</span>
          </div>
        )}
      </section>

      <div className="success-grid">
        <section className="checkout-section">
          <h2>Items</h2>
          <ul className="cart-items cart-items--page">
            {order.items.map((item, index) => (
              <li key={index} className="cart-item">
                <div className="cart-item-copy">
                  <div className="cart-item-title">
                    <strong>
                      {item.quantity} × {item.name}
                    </strong>
                  </div>
                  {item.customizations.length > 0 && <small>{item.customizations.map((c) => c.optionName).join(", ")}</small>}
                  <span className="cart-item-price">{inr(item.price * item.quantity)}</span>
                </div>
              </li>
            ))}
          </ul>
          <div className="success-facts">
            <p>
              <MapPin size={15} /> {order.deliveryAddress.formattedAddress}, {order.deliveryAddress.pincode}
            </p>
            <p>
              <Wallet size={15} /> {order.paymentMethod === "COD" ? "Pay at delivery" : "Paid via test payment"}
            </p>
            <p>
              <span className="badge badge--neutral">Updated {timeAgo(order.createdAt)}</span>
            </p>
          </div>
        </section>
        <section className="checkout-section">
          <h2>Bill summary</h2>
          <PriceBreakdown subtotal={order.subtotal} deliveryFee={order.deliveryFee} discount={order.discount} total={order.total} />
          {order.couponCode && <p className="coupon-applied coupon-applied--static">🏷 Coupon {order.couponCode} applied</p>}

          {showFeedbackForm && (
            <div className="feedback-card">
              <h3>How was your order?</h3>
              <div className="star-rating" role="radiogroup" aria-label="Rate your order">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={value <= rating ? "on" : ""}
                    onClick={() => setRating(value)}
                    aria-label={`${value} star${value === 1 ? "" : "s"}`}
                    aria-pressed={value <= rating}
                  >
                    <Star size={22} fill={value <= rating ? "currentColor" : "none"} />
                  </button>
                ))}
              </div>
              <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Tell us about the food (optional)" maxLength={500} />
              <button className="filter" disabled={rating === 0 || submitting} onClick={() => void submitFeedback()}>
                {submitting ? "Submitting…" : "Submit rating"}
              </button>
            </div>
          )}
          {feedback && (
            <div className="feedback-card feedback-card--done">
              <h3>
                <Star size={16} fill="currentColor" /> You rated this order
              </h3>
              <p className="star-summary">
                {"★".repeat(feedback.rating)}
                <span className="dim">{"★".repeat(5 - feedback.rating)}</span>
              </p>
              {feedback.comment && <p className="feedback-comment">"{feedback.comment}"</p>}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
