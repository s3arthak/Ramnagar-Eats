import { Suspense, useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getSocket } from "../lib/socket";
import type { Order, RestaurantProfile } from "../lib/types";
import { api } from "../lib/api";

export function Shell({ children, restaurant, onRestaurantChange, isAdmin }: { children: React.ReactNode; restaurant: RestaurantProfile | null; onRestaurantChange: (restaurant: RestaurantProfile) => void; isAdmin: boolean }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [newOrders, setNewOrders] = useState(0);

  useEffect(() => {
    if (isAdmin) return;
    const refresh = async () => {
      try {
        const data = await api.get<{ orders: Order[] }>("/restaurant/orders");
        setNewOrders(data.orders.filter((order) => order.status === "PLACED").length);
      } catch {
        /* keep current count */
      }
    };
    void refresh();
    const onOrderEvent = () => void refresh();
    getSocket().on("order:new", onOrderEvent);
    getSocket().on("order:updated", onOrderEvent);
    return () => {
      getSocket().off("order:new", onOrderEvent);
      getSocket().off("order:updated", onOrderEvent);
    };
  }, [isAdmin]);

  async function toggleOpen() {
    if (!restaurant) return;
    try {
      const data = await api.patch<{ restaurant: { isOpen: boolean } }>("/restaurant/status", { isOpen: !restaurant.isOpen });
      onRestaurantChange({ ...restaurant, isOpen: data.restaurant.isOpen });
    } catch {
      /* keep current state */
    }
  }

  const links: [string, string, string][] = [
    ["/dashboard", "▦", "Dashboard"],
    ["/orders", "▤", "Orders"],
    ["/menu", "☷", "Menu"],
    ["/restaurant", "⌖", "Restaurant"],
  ];
  if (isAdmin) links.push(["/admin", "⚙", "Admin"]);

  return (
    <div className="app-shell">
      <aside>
        <a className="brand" href="/" aria-label="Ramnagar Eats home">
          <span className="brand-mark" aria-hidden="true">🍛</span>
          <span className="brand-name">RAMNAGAR <b>EATS</b></span>
        </a>
        <p className="restaurant-name">{restaurant?.name ?? "Set up your restaurant"}</p>
        <nav>
          {links.map(([path, icon, label]) => (
            <NavLink key={path} to={path} className={({ isActive }) => (isActive ? "active" : "")}>
              {icon} {label}
              {path === "/orders" && newOrders > 0 && <em>{newOrders}</em>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <small>RESTAURANT STATUS</small>
          <button onClick={() => void toggleOpen()} disabled={!restaurant}>
            <i className={restaurant?.isOpen && restaurant?.isAcceptingOrders ? "open-dot" : ""} />
            {restaurant ? (restaurant.isOpen && restaurant.isAcceptingOrders ? "Accepting orders" : restaurant.isOpen ? "Paused — not accepting" : "Temporarily closed") : "Set up profile"}
          </button>
          <button className="logout" onClick={() => void logout().then(() => navigate("/login"))}>
            Sign out ({user?.name.split(" ")[0]})
          </button>
        </div>
      </aside>
      <main>
        <Suspense fallback={<div style={{ padding: "48px 24px", textAlign: "center", color: "#6a7b75" }}>Loading…</div>}>{children}</Suspense>
      </main>
    </div>
  );
}
