import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, ChevronRight, Package } from "lucide-react";
import { api } from "../lib/api";
import { inr } from "../lib/format";
import { formatDateTime } from "../lib/format";
import { STATUS_LABELS, statusTone, isActive, isCancelable } from "../lib/order";
import type { MenuItem, Order } from "../lib/types";
import { useCart } from "../context/CartContext";
import { getSocket } from "../lib/socket";
import { EmptyState, ErrorState } from "../components/ui/StateViews";
import { Spinner } from "../components/ui/Skeleton";

export function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reordering, setReordering] = useState("");
  const { addItem, setDrawerOpen } = useCart();
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.get<{ orders: Order[] }>("/orders");
      setOrders(data.orders);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load your orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const handleUpdate = () => void load();
    getSocket().on("order:updated", handleUpdate);
    return () => {
      getSocket().off("order:updated", handleUpdate);
    };
  }, [load]);

  async function reorder(order: Order) {
    setReordering(order.id);
    setNotice("");
    try {
      const [restaurant, menu] = await Promise.all([
        api.get<{ restaurant: { id: string; name: string; isOpen: boolean } }>(`/restaurants/${order.restaurantId}`),
        api.get<{ categories: { items: MenuItem[] }[] }>(`/restaurants/${order.restaurantId}/menu`),
      ]);
      if (!restaurant.restaurant.isOpen) {
        setNotice(`${restaurant.restaurant.name} is currently closed, so we couldn't reorder.`);
        return;
      }
      const menuItems = new Map(menu.categories.flatMap((category) => category.items).map((item) => [item.id, item]));
      let added = 0;
      let skipped = 0;
      for (const line of order.items) {
        const item = menuItems.get(line.itemId);
        if (!item || !item.isAvailable) {
          skipped += 1;
          continue;
        }
        const customizations = line.customizations.map((c) => ({ name: c.name, optionName: c.optionName, price: c.price }));
        for (let count = 0; count < line.quantity; count += 1) {
          const ok = await addItem({ id: restaurant.restaurant.id, name: restaurant.restaurant.name }, item, customizations);
          if (ok) added += 1;
        }
      }
      if (added > 0) {
        setNotice(`Added ${added} item${added === 1 ? "" : "s"} back to your cart.`);
        setDrawerOpen(true);
      } else {
        setNotice(skipped > 0 ? "Those items are no longer available." : "Couldn't reorder — nothing was added.");
      }
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not reorder");
    } finally {
      setReordering("");
    }
  }

  return (
    <div className="content page orders-page">
      <div className="account-head">
        <button className="account-back" onClick={() => navigate(-1)} aria-label="Go back">
          ←
        </button>
        <h1>MY ACCOUNT</h1>
        <span className="account-help">ORDERS</span>
      </div>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {loading ? (
        <Spinner label="Loading your orders…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={<Package size={30} />}
          title="No orders yet"
          copy="Your orders will appear here once you place one."
          action={
            <Link className="filter" to="/restaurants">
              Browse restaurants
            </Link>
          }
        />
      ) : (
        <ul className="order-stack">
          {orders.map((order) => (
            <li key={order.id} className="order-stack-card">
              <Link to={`/orders/${order.id}`} className="order-stack-head">
                <span className="order-thumb">
                  {order.restaurantCover ? (
                    <img src={order.restaurantCover} alt="" loading="lazy" />
                  ) : (
                    <span aria-hidden="true">🍽️</span>
                  )}
                </span>
                <span className="order-stack-title">
                  <strong>{order.restaurantName}</strong>
                  <small>{order.orderNumber} · {order.deliveryAddress.label} · {order.deliveryAddress.pincode}</small>
                </span>
                {order.status === "DELIVERED" ? (
                  <span className="order-done">Delivered <CheckCircle2 size={17} /></span>
                ) : (
                  <span className={`status ${statusTone(order.status)}`}>{STATUS_LABELS[order.status]}</span>
                )}
              </Link>
              <ul className="order-stack-items">
                {order.items.slice(0, 3).map((item, index) => (
                  <li key={index}>
                    <span className="qty-chip">{item.quantity} X</span>
                    {item.name}
                  </li>
                ))}
                {order.items.length > 3 && (
                  <li>
                    <Link className="order-more-link" to={`/orders/${order.id}`}>
                      &amp; {order.items.length - 3} more
                    </Link>
                  </li>
                )}
              </ul>
              <div className="order-stack-actions">
                <button className="reorder-pill" disabled={reordering === order.id} onClick={() => void reorder(order)}>
                  {reordering === order.id ? "ADDING…" : (
                    <>
                      REORDER <ChevronRight size={15} />
                    </>
                  )}
                </button>
                {!isActive(order.status) && isCancelable(order.status) && null}
              </div>
              <p className="order-stack-foot">
                Ordered: {formatDateTime(order.createdAt)} · Bill total: <b>{inr(order.total)}</b>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
