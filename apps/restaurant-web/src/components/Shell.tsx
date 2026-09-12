import { Suspense, useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { FoodSpinner } from "./FoodSpinner";
import { getSocket } from "../lib/socket";
import type { Order, RestaurantProfile } from "../lib/types";
import { api } from "../lib/api";

export function Shell({ children, restaurant, onRestaurantChange, isAdmin }: { children: React.ReactNode; restaurant: RestaurantProfile | null; onRestaurantChange: (restaurant: RestaurantProfile) => void; isAdmin: boolean }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [newOrders, setNewOrders] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
      {/* Mobile hamburger */}
      <button className="mobile-hamburger" onClick={() => setSidebarOpen(true)} aria-label="Open navigation menu">
        <Menu size={22} />
      </button>

      {/* Mobile overlay */}
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      <aside className={sidebarOpen ? "open" : ""}>
        <button className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close navigation">
          <X size={22} />
        </button>
        <a className="brand" href="/" aria-label="Ramnagar Eats home">
          <img className="brand-mark" src="/logo-mark.svg" alt="" width="32" height="32" />
          <span className="brand-name">RAMNAGAR <b>EATS</b></span>
        </a>
        <p className="restaurant-name">{restaurant?.name ?? "Set up your restaurant"}</p>
        <nav>
          {links.map(([path, icon, label]) => (
            <NavLink key={path} to={path} className={({ isActive }) => (isActive ? "active" : "")} onClick={() => setSidebarOpen(false)}>
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
        <Suspense fallback={<FoodSpinner />}>{children}</Suspense>
      </main>
    </div>
  );
}
