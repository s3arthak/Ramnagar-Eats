import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, Clock3, MapPin, Wallet } from "lucide-react";
import { api } from "../lib/api";
import { formatDateTime, inr } from "../lib/format";
import { STATUS_SHORT } from "../lib/order";
import type { Order } from "../lib/types";
import { PriceBreakdown } from "../components/cart";
import { ErrorState } from "../components/ui/StateViews";
import { Spinner } from "../components/ui/Skeleton";

export function OrderSuccessPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api
      .get<{ order: Order }>(`/orders/${id}`)
      .then((data) => {
        if (active) setOrder(data.order);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load your order");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="content">
        <Spinner label="Loading your order…" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="content page">
        <ErrorState message={error || "Order not found"} />
      </div>
    );
  }

  return (
    <div className="content page order-success">
      <div className="success-hero">
        <CheckCircle2 size={52} />
        <h1>Order placed!</h1>
        <p>
          Order <b>{order.orderNumber}</b> from {order.restaurantName}
        </p>
        <span className="badge badge--open">{STATUS_SHORT[order.status]}</span>
      </div>

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
              <Clock3 size={15} /> Estimated delivery: {order.estimatedDeliveryAt ? formatDateTime(order.estimatedDeliveryAt) : "as soon as possible"}
            </p>
            <p>
              <Wallet size={15} /> Payment: {order.paymentMethod === "COD" ? "Cash on Delivery" : "Card / UPI (test)"} · {order.paymentStatus === "PAID" ? "Paid" : "Pay at delivery"}
            </p>
            <p>
              <MapPin size={15} /> {order.deliveryAddress.formattedAddress}, {order.deliveryAddress.pincode}
            </p>
          </div>
        </section>
        <section className="checkout-section">
          <h2>Bill summary</h2>
          <PriceBreakdown subtotal={order.subtotal} deliveryFee={order.deliveryFee} discount={order.discount} total={order.total} />
          {order.couponCode && <p className="coupon-applied coupon-applied--static">🏷 Coupon {order.couponCode} applied</p>}
          <div className="success-actions">
            <Link className="filter" to="/orders">
              Track my orders
            </Link>
            <Link className="filter" to="/">
              Back to home
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
