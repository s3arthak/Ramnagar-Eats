import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { inr, timeAgo } from "../lib/format";
import { nextAction, STATUS_LABELS, statusTone } from "../lib/order";
import { getSocket } from "../lib/socket";
import { useToast } from "../context/ToastContext";
import type { Order, OrderStatus } from "../lib/types";

export function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");
  const { push } = useToast();

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ orders: Order[] }>("/restaurant/orders");
      setOrders(data.orders);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not load orders");
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 10000);
    const handleNew = (payload: { order: Order }) => {
      push("New order received", { body: `${payload.order.orderNumber} · ${payload.order.customerName} · ${inr(payload.order.total)}`, tone: "success" });
      void load();
    };
    const handleUpdated = () => void load();
    getSocket().on("order:new", handleNew);
    getSocket().on("order:updated", handleUpdated);
    return () => {
      clearInterval(timer);
      getSocket().off("order:new", handleNew);
      getSocket().off("order:updated", handleUpdated);
    };
  }, [load, push]);

  async function advance(order: Order, next: OrderStatus) {
    setBusyId(order.id);
    setNotice("");
    try {
      await api.patch(`/restaurant/orders/${order.id}/status`, { status: next });
      await load();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not update the order");
    } finally {
      setBusyId("");
    }
  }

  const sorted = [...orders].sort((a, b) => {
    const rank = (status: OrderStatus) => (status === "PLACED" ? 0 : status === "CONFIRMED" ? 1 : status === "PREPARING" ? 2 : status === "READY" ? 3 : status === "PICKED_UP" ? 4 : status === "OUT_FOR_DELIVERY" ? 5 : 6);
    return rank(a.status) - rank(b.status) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <>
      <header>
        <div>
          <p className="eyebrow">ORDER QUEUE</p>
          <h1>Orders</h1>
        </div>
        <span className="queue-count">{orders.filter((order) => order.status === "PLACED").length} new</span>
      </header>
      {notice && <p className="notice">{notice}</p>}
      {sorted.length === 0 ? (
        <div className="empty">
          <p>No orders yet. New orders from customers will appear here automatically.</p>
        </div>
      ) : (
        <div className="order-queue">
          {sorted.map((order) => {
            const action = nextAction(order.status);
            return (
              <article key={order.id} className={`order-tile status-${order.status.toLowerCase()}`}>
                <div className="order-tile-head">
                  <div>
                    <strong>{order.orderNumber}</strong>
                    <span className={`status ${statusTone(order.status)}`}>{STATUS_LABELS[order.status]}</span>
                  </div>
                  <span className="order-tile-time">{timeAgo(order.createdAt)}</span>
                </div>
                <p className="order-tile-customer">
                  {order.customerName} · {order.paymentMethod === "COD" ? "COD" : "Paid online"}
                </p>
                <ul className="order-tile-items">
                  {order.items.map((item, index) => (
                    <li key={index}>
                      <span>
                        {item.quantity} × {item.name}
                        {item.customizations.length > 0 && <small> ({item.customizations.map((c) => c.optionName).join(", ")})</small>}
                      </span>
                      <b>{inr(item.price * item.quantity)}</b>
                    </li>
                  ))}
                </ul>
                <p className="order-tile-address">
                  📍 {order.deliveryAddress.formattedAddress}, {order.deliveryAddress.pincode}
                </p>
                <div className="order-tile-foot">
                  <span>
                    Total <b>{inr(order.total)}</b>
                  </span>
                  <div className="order-tile-actions">
                    {order.status === "PLACED" && (
                      <button className="action reject" disabled={busyId === order.id} onClick={() => void advance(order, "CANCELLED")}>
                        Reject
                      </button>
                    )}
                    {action && (
                      <button className="action accept" disabled={busyId === order.id} onClick={() => void advance(order, action.next)}>
                        {action.label}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
