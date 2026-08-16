import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Package, RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import { formatDateTime, inr } from "../lib/format";
import { STATUS_LABELS, statusTone } from "../lib/order";
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
    <div className="content page">
      <h1 className="page-title">My orders</h1>
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
        <ul className="orders-list">
          {orders.map((order) => (
            <li key={order.id} className="order-card">
              <div className="order-card-head">
                <div>
                  <strong>{order.restaurantName}</strong>
                  <span className={`status ${statusTone(order.status)}`}>{STATUS_LABELS[order.status]}</span>
                </div>
                <span className="order-card-total">{inr(order.total)}</span>
              </div>
              <p className="order-card-meta">
                {order.orderNumber} · {formatDateTime(order.createdAt)}
              </p>
              <p className="order-card-items">
                {order.items.map((item) => `${item.quantity} × ${item.name}`).join(", ")}
              </p>
              <div className="order-card-actions">
                <Link className="filter" to={`/orders/${order.id}`}>
                  View order
                </Link>
                <button className="filter" disabled={reordering === order.id} onClick={() => void reorder(order)}>
                  <RefreshCw size={13} /> {reordering === order.id ? "Adding…" : "Reorder"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="summary-note" style={{ marginTop: 18 }}>
        Tip: you can also reorder from the cart drawer after adding items.
      </p>
    </div>
  );
}
