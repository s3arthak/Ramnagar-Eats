import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { inr, timeAgo } from "../lib/format";
import { STATUS_LABELS, statusTone } from "../lib/order";

interface Metrics {
  totalOrders: number;
  todayOrders: number;
  activeOrders: number;
  restaurants: number;
  customers: number;
  revenue: number;
}
interface AdminRestaurant {
  id: string;
  name: string;
  cuisines: string[];
  isOpen: boolean;
  isActive: boolean;
  rating: number;
  owner: { name: string; phone: string } | null;
  createdAt: string;
}
interface AdminUser {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  role: string;
  createdAt: string;
}
interface AdminOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  restaurantName: string;
  total: number;
  status: string;
  createdAt: string;
}
interface ServiceArea {
  lat: number;
  lng: number;
  address: string;
  pincode: string;
  radiusKm: number;
}

const EMPTY_AREA: ServiceArea = { lat: 19.076, lng: 72.8777, address: "", pincode: "", radiusKm: 10 };

type Tab = "metrics" | "restaurants" | "users" | "orders" | "service";

export function AdminPage() {
  const [tab, setTab] = useState<Tab>("metrics");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [restaurants, setRestaurants] = useState<AdminRestaurant[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [serviceArea, setServiceArea] = useState<ServiceArea>(EMPTY_AREA);
  const [notice, setNotice] = useState("");
  const [savingArea, setSavingArea] = useState(false);

  const load = useCallback(async () => {
    try {
      const [metricsData, restaurantData, userData, orderData, areaData] = await Promise.all([
        api.get<{ metrics: Metrics }>("/admin/metrics"),
        api.get<{ restaurants: AdminRestaurant[] }>("/admin/restaurants"),
        api.get<{ users: AdminUser[] }>("/admin/users"),
        api.get<{ orders: AdminOrder[] }>("/admin/orders"),
        api.get<{ serviceArea: ServiceArea }>("/admin/service-area"),
      ]);
      setMetrics(metricsData.metrics);
      setRestaurants(restaurantData.restaurants);
      setUsers(userData.users);
      setOrders(orderData.orders);
      setServiceArea(areaData.serviceArea);
      setNotice("");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not load admin data");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleRestaurant(restaurant: AdminRestaurant) {
    try {
      await api.patch(`/admin/restaurants/${restaurant.id}`, { isActive: !restaurant.isActive });
      await load();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not update restaurant");
    }
  }

  async function saveServiceArea() {
    setNotice("");
    setSavingArea(true);
    try {
      await api.patch("/admin/service-area", serviceArea);
      setNotice("Delivery area updated — customers see the new radius immediately.");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not update the delivery area");
    } finally {
      setSavingArea(false);
    }
  }

  return (
    <>
      <header>
        <div>
          <p className="eyebrow">PLATFORM ADMIN</p>
          <h1>Admin</h1>
        </div>
      </header>
      {notice && <p className="notice">{notice}</p>}
      <div className="admin-tabs">
        {(["metrics", "restaurants", "users", "orders", "service"] as Tab[]).map((name) => (
          <button key={name} className={tab === name ? "active" : ""} onClick={() => setTab(name)}>
            {name === "service" ? "Service area" : name[0].toUpperCase() + name.slice(1)}
          </button>
        ))}
      </div>

      {tab === "metrics" && metrics && (
        <section className="stats">
          {[
            ["Total orders", String(metrics.totalOrders), "All time"],
            ["Today's orders", String(metrics.todayOrders), "Since midnight"],
            ["Active orders", String(metrics.activeOrders), "In progress"],
            ["Restaurants", String(metrics.restaurants), "Active on platform"],
            ["Customers", String(metrics.customers), "Registered"],
            ["Revenue", inr(metrics.revenue), "Delivered orders"],
          ].map(([label, value, note]) => (
            <article key={label}>
              <p>{label}</p>
              <strong>{value}</strong>
              <small>{note}</small>
            </article>
          ))}
        </section>
      )}

      {tab === "restaurants" && (
        <section className="table">
          <div className="table-header">
            <span>RESTAURANT</span>
            <span>OWNER</span>
            <span>CUISINES</span>
            <span>STATUS</span>
            <span />
          </div>
          {restaurants.map((restaurant) => (
            <div className="table-row" key={restaurant.id}>
              <strong>
                {restaurant.name} <span className="muted">★ {restaurant.rating.toFixed(1)}</span>
              </strong>
              <span>{restaurant.owner?.name ?? "—"}</span>
              <span>{restaurant.cuisines.join(", ")}</span>
              <span>
                <span className={`status ${restaurant.isOpen ? "delivered" : "cancelled"}`}>{restaurant.isOpen ? "Open" : "Closed"}</span>
              </span>
              <button className={`action ${restaurant.isActive ? "" : "reject"}`} onClick={() => void toggleRestaurant(restaurant)}>
                {restaurant.isActive ? "Disable" : "Approve"}
              </button>
            </div>
          ))}
        </section>
      )}

      {tab === "users" && (
        <section className="table">
          <div className="table-header">
            <span>NAME</span>
            <span>PHONE</span>
            <span>EMAIL</span>
            <span>ROLE</span>
            <span>JOINED</span>
          </div>
          {users.map((user) => (
            <div className="table-row" key={user.id}>
              <strong>{user.name}</strong>
              <span>{user.phone ?? "—"}</span>
              <span>{user.email ?? "—"}</span>
              <span className={`status ${user.role === "RESTAURANT" ? "preparing" : "new"}`}>{user.role}</span>
              <span className="muted">{timeAgo(user.createdAt)}</span>
            </div>
          ))}
        </section>
      )}

      {tab === "service" && (
        <section className="service-area-form">
          <div className="service-area-intro">
            <h3>Delivery area</h3>
            <p>This is the service center customers are measured against. Orders to addresses outside the radius are rejected by the backend.</p>
          </div>
          <div className="form-grid">
            <label>
              Center latitude
              <input type="number" step="any" value={serviceArea.lat} onChange={(event) => setServiceArea({ ...serviceArea, lat: Number(event.target.value) })} />
            </label>
            <label>
              Center longitude
              <input type="number" step="any" value={serviceArea.lng} onChange={(event) => setServiceArea({ ...serviceArea, lng: Number(event.target.value) })} />
            </label>
            <label>
              Radius (km)
              <input type="number" min={1} max={50} value={serviceArea.radiusKm} onChange={(event) => setServiceArea({ ...serviceArea, radiusKm: Number(event.target.value) })} />
            </label>
            <label>
              Pincode
              <input value={serviceArea.pincode} onChange={(event) => setServiceArea({ ...serviceArea, pincode: event.target.value })} placeholder="400001" />
            </label>
            <label className="wide">
              Address label
              <input value={serviceArea.address} onChange={(event) => setServiceArea({ ...serviceArea, address: event.target.value })} placeholder="Ramnagar Eats Hub, Mumbai" />
            </label>
          </div>
          <button className="action accept" disabled={savingArea} onClick={() => void saveServiceArea()}>
            {savingArea ? "Saving…" : "Save delivery area"}
          </button>
        </section>
      )}

      {tab === "orders" && (
        <section className="table">
          <div className="table-header">
            <span>ORDER</span>
            <span>CUSTOMER</span>
            <span>RESTAURANT</span>
            <span>TOTAL</span>
            <span>STATUS</span>
          </div>
          {orders.map((order) => (
            <div className="table-row" key={order.id}>
              <strong>{order.orderNumber}</strong>
              <span>{order.customerName}</span>
              <span>{order.restaurantName}</span>
              <span>{inr(order.total)}</span>
              <span className={`status ${statusTone(order.status as any)}`}>{STATUS_LABELS[order.status as keyof typeof STATUS_LABELS]}</span>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
