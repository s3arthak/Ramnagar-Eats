import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Bike, Check, ChefHat, MapPin, Package, ShoppingCart, Star, Wallet } from "lucide-react";
import { api } from "../lib/api";
import { formatDateTime, inr, timeAgo } from "../lib/format";
import { isActive, isCancelable, STATUS_LABELS, statusTone, TIMELINE } from "../lib/order";
import type { Order, OrderStatus } from "../lib/types";
import { getSocket } from "../lib/socket";
import { PriceBreakdown } from "../components/cart";
import { ErrorState } from "../components/ui/StateViews";
import { Spinner } from "../components/ui/Skeleton";
import { useToast } from "../context/ToastContext";

/** Icons for each tracking stage — keeps the timeline visual and consistent. */
const STAGE_ICONS: Record<string, React.ReactNode> = {
  PLACED: <ShoppingCart size={14} />,
  CONFIRMED: <Check size={14} />,
  PREPARING: <ChefHat size={14} />,
  READY: <Package size={14} />,
  PICKED_UP: <Bike size={14} />,
  OUT_FOR_DELIVERY: <Bike size={14} />,
  DELIVERED: <Check size={14} />,
};

/** Remaining ETA in minutes, computed from the server timestamp so refresh never resets it. */
function useEtaMinutes(estimatedDeliveryAt?: string, status?: OrderStatus): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!estimatedDeliveryAt || !isActive(status ?? "PLACED")) return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [estimatedDeliveryAt, status]);
  if (!estimatedDeliveryAt) return null;
  const remaining = Math.ceil((new Date(estimatedDeliveryAt).getTime() - now) / 60_000);
  return remaining;
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [feedback, setFeedback] = useState<{ rating: number; comment: string } | null>(null);
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
      if (payload.order.id === id) setOrder(payload.order);
    };
    getSocket().on("order:updated", handleUpdate);
    const timer = setInterval(() => {
      if (!isActive(order?.status ?? "PLACED")) return;
      void load();
    }, 8000);
    return () => {
      getSocket().off("order:updated", handleUpdate);
      clearInterval(timer);
    };
  }, [load, order?.status, id]);

  const etaMinutes = useEtaMinutes(order?.estimatedDeliveryAt, order?.status);
  const etaMessage =
    order && order.estimatedDeliveryAt && isActive(order.status)
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
            <small>Estimated by {formatDateTime(order.estimatedDeliveryAt!)}</small>
          </p>
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
              {feedback.comment && <p className="feedback-comment">“{feedback.comment}”</p>}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
