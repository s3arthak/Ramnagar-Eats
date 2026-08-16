import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { inr, timeAgo } from "../lib/format";
import { STATUS_LABELS, statusTone } from "../lib/order";
import { getSocket } from "../lib/socket";
import { useToast } from "../context/ToastContext";
import type { DashboardData, Order } from "../lib/types";

export function DashboardPage({ onSetup }: { onSetup: () => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [notice, setNotice] = useState("");
  const { push } = useToast();

  const load = useCallback(async () => {
    try {
      setData(await api.get<DashboardData>("/restaurant/dashboard"));
      setNotice("");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not load your dashboard");
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 15000);
    const handleNew = (payload: { order: Order }) => {
      push("🔔 New order", { body: `${payload.order.orderNumber} · ${inr(payload.order.total)}`, tone: "success" });
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

  if (!data) {
    return (
      <>
        <header>
          <div>
            <p className="eyebrow">RESTAURANT WORKSPACE</p>
            <h1>Dashboard</h1>
          </div>
        </header>
        {notice && <p className="notice">{notice}</p>}
        {!notice && <p className="notice">Loading your dashboard…</p>}
        {notice?.includes("profile") && (
          <div className="empty">
            <p>Add your restaurant details and menu to start receiving local orders.</p>
            <button className="action" onClick={onSetup}>
              Set up restaurant
            </button>
          </div>
        )}
      </>
    );
  }

  const cards: [string, string, string][] = [
    ["New orders", String(data.stats.pendingOrders), "Awaiting action"],
    ["Preparing / active", String(data.stats.activeOrders), "In the kitchen or on the way"],
    ["Ready", String(data.stats.readyOrders), "Ready to dispatch"],
    ["Today's revenue", inr(data.stats.todayRevenue), `${data.stats.todayOrders} order${data.stats.todayOrders === 1 ? "" : "s"} today`],
  ];

  return (
    <>
      <header>
        <div>
          <p className="eyebrow">RESTAURANT WORKSPACE</p>
          <h1>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, {data.restaurant.name}.</h1>
        </div>
        <span className={`status ${data.restaurant.isOpen && data.restaurant.isAcceptingOrders !== false ? "delivered" : "cancelled"}`}>
          {data.restaurant.isOpen && data.restaurant.isAcceptingOrders !== false ? "Accepting orders" : data.restaurant.isOpen ? "Paused — not accepting" : "Temporarily closed"}
        </span>
      </header>
      {notice && <p className="notice">{notice}</p>}
      <section className="stats">
        {cards.map(([label, value, note]) => (
          <article key={label}>
            <p>{label}</p>
            <strong>{value}</strong>
            <small>{note}</small>
          </article>
        ))}
      </section>
      <section className="orders">
        <div className="section-title">
          <div>
            <p className="eyebrow">LIVE QUEUE</p>
            <h2>Recent orders</h2>
          </div>
          <Link to="/orders">View all orders →</Link>
        </div>
        {data.recentOrders.length === 0 ? (
          <div className="empty">
            <p>No orders yet. Once customers order from you, they'll show up here in real time.</p>
          </div>
        ) : (
          <div className="table">
            <div className="table-header">
              <span>ORDER</span>
              <span>CUSTOMER</span>
              <span>DETAILS</span>
              <span>STATUS</span>
              <span />
            </div>
            {data.recentOrders.map((order) => (
              <div className="table-row" key={order.id}>
                <strong>{order.orderNumber}</strong>
                <span>{order.customerName}</span>
                <span>
                  {order.items.reduce((sum, item) => sum + item.quantity, 0)} items · {inr(order.total)}
                </span>
                <span className={`status ${statusTone(order.status)}`}>{STATUS_LABELS[order.status]}</span>
                <Link className="action" to="/orders">
                  View
                </Link>
              </div>
            ))}
          </div>
        )}
        <p className="table-note">Last refreshed {data.recentOrders[0] ? timeAgo(data.recentOrders[0].createdAt) : "—"}</p>
      </section>
    </>
  );
}
