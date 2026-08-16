import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { inr, timeAgo } from "../lib/format";
import { STATUS_LABELS, statusTone } from "../lib/order";
import { useToast } from "../context/ToastContext";

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
interface AdminCoupon {
  id: string;
  code: string;
  description: string;
  discountType: "PERCENT" | "FLAT";
  discountValue: number;
  maxDiscount: number | null;
  minOrderValue: number;
  usageLimit: number;
  perUserLimit: number;
  usedCount: number;
  isActive: boolean;
}

const EMPTY_AREA: ServiceArea = { lat: 19.076, lng: 72.8777, address: "", pincode: "", radiusKm: 10 };

type Tab = "metrics" | "restaurants" | "users" | "orders" | "service" | "coupons";

interface CouponForm {
  code: string;
  description: string;
  discountType: "PERCENT" | "FLAT";
  discountValue: string;
  maxDiscount: string;
  minOrderValue: string;
  usageLimit: string;
  isActive: boolean;
}

const EMPTY_COUPON: CouponForm = {
  code: "",
  description: "",
  discountType: "PERCENT",
  discountValue: "",
  maxDiscount: "",
  minOrderValue: "0",
  usageLimit: "0",
  isActive: true,
};

export function AdminPage() {
  const [tab, setTab] = useState<Tab>("metrics");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [restaurants, setRestaurants] = useState<AdminRestaurant[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [serviceArea, setServiceArea] = useState<ServiceArea>(EMPTY_AREA);
  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  const [couponForm, setCouponForm] = useState<CouponForm>(EMPTY_COUPON);
  const [notice, setNotice] = useState("");
  const { push } = useToast();
  const [savingArea, setSavingArea] = useState(false);
  const [savingCoupon, setSavingCoupon] = useState(false);

  const load = useCallback(async () => {
    try {
      const [metricsData, restaurantData, userData, orderData, areaData, couponData] = await Promise.all([
        api.get<{ metrics: Metrics }>("/admin/metrics"),
        api.get<{ restaurants: AdminRestaurant[] }>("/admin/restaurants"),
        api.get<{ users: AdminUser[] }>("/admin/users"),
        api.get<{ orders: AdminOrder[] }>("/admin/orders"),
        api.get<{ serviceArea: ServiceArea }>("/admin/service-area"),
        api.get<{ coupons: AdminCoupon[] }>("/admin/coupons"),
      ]);
      setMetrics(metricsData.metrics);
      setRestaurants(restaurantData.restaurants);
      setUsers(userData.users);
      setOrders(orderData.orders);
      setServiceArea(areaData.serviceArea);
      setCoupons(couponData.coupons);
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
      push("📍 Delivery area saved", { body: "Customers are now measured against the new center and radius.", tone: "success" });
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not update the delivery area");
      push(caught instanceof Error ? caught.message : "Could not update the delivery area", { tone: "danger" });
    } finally {
      setSavingArea(false);
    }
  }

  async function createCoupon() {
    if (!couponForm.code.trim() || !couponForm.discountValue) return;
    setNotice("");
    setSavingCoupon(true);
    try {
      const body: Record<string, unknown> = {
        code: couponForm.code.trim(),
        description: couponForm.description.trim(),
        discountType: couponForm.discountType,
        discountValue: Number(couponForm.discountValue),
        minOrderValue: Number(couponForm.minOrderValue) || 0,
        usageLimit: Number(couponForm.usageLimit) || 0,
        isActive: couponForm.isActive,
      };
      if (couponForm.maxDiscount.trim()) body.maxDiscount = Number(couponForm.maxDiscount);
      await api.post("/admin/coupons", body);
      setCouponForm(EMPTY_COUPON);
      setNotice(`Coupon ${couponForm.code.trim().toUpperCase()} created.`);
      await load();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not create the coupon");
    } finally {
      setSavingCoupon(false);
    }
  }

  async function toggleCoupon(coupon: AdminCoupon) {
    try {
      await api.patch(`/admin/coupons/${coupon.id}`, { isActive: !coupon.isActive });
      await load();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not update the coupon");
    }
  }

  async function deleteCoupon(coupon: AdminCoupon) {
    if (!window.confirm(`Delete coupon ${coupon.code}? This cannot be undone.`)) return;
    try {
      await api.delete(`/admin/coupons/${coupon.id}`);
      setNotice(`Coupon ${coupon.code} deleted.`);
      await load();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not delete the coupon");
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
        {(["metrics", "restaurants", "users", "orders", "service", "coupons"] as Tab[]).map((name) => (
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

      {tab === "coupons" && (
        <section className="service-area-form">
          <div className="service-area-intro">
            <h3>Coupons</h3>
            <p>Create and manage discount codes. Active coupons are applied automatically at checkout (usage, limits and restaurant targeting are enforced by the backend).</p>
          </div>
          <div className="form-grid">
            <label>
              Code
              <input value={couponForm.code} onChange={(event) => setCouponForm({ ...couponForm, code: event.target.value.toUpperCase() })} placeholder="SAVE20" />
            </label>
            <label>
              Description
              <input value={couponForm.description} onChange={(event) => setCouponForm({ ...couponForm, description: event.target.value })} placeholder="20% off up to ₹100" />
            </label>
            <label>
              Discount type
              <select value={couponForm.discountType} onChange={(event) => setCouponForm({ ...couponForm, discountType: event.target.value as "PERCENT" | "FLAT" })}>
                <option value="PERCENT">Percentage (%)</option>
                <option value="FLAT">Flat amount</option>
              </select>
            </label>
            <label>
              Discount value
              <input type="number" min={1} value={couponForm.discountValue} onChange={(event) => setCouponForm({ ...couponForm, discountValue: event.target.value })} placeholder="20" />
            </label>
            <label>
              Max discount (optional)
              <input type="number" min={0} value={couponForm.maxDiscount} onChange={(event) => setCouponForm({ ...couponForm, maxDiscount: event.target.value })} placeholder="100" />
            </label>
            <label>
              Minimum order
              <input type="number" min={0} value={couponForm.minOrderValue} onChange={(event) => setCouponForm({ ...couponForm, minOrderValue: event.target.value })} placeholder="0" />
            </label>
            <label>
              Usage limit (0 = unlimited)
              <input type="number" min={0} value={couponForm.usageLimit} onChange={(event) => setCouponForm({ ...couponForm, usageLimit: event.target.value })} placeholder="0" />
            </label>
            <label className="wide checkbox-label">
              <input type="checkbox" checked={couponForm.isActive} onChange={(event) => setCouponForm({ ...couponForm, isActive: event.target.checked })} />
              Active immediately
            </label>
          </div>
          <button className="action accept" disabled={savingCoupon || !couponForm.code.trim() || !couponForm.discountValue} onClick={() => void createCoupon()}>
            {savingCoupon ? "Creating…" : "Create coupon"}
          </button>
          <div className="table" style={{ marginTop: 28 }}>
            <div className="table-header">
              <span>CODE</span>
              <span>DISCOUNT</span>
              <span>MIN ORDER</span>
              <span>USAGE</span>
              <span>STATUS</span>
              <span />
            </div>
            {coupons.map((coupon) => (
              <div className="table-row" key={coupon.id}>
                <strong>{coupon.code}</strong>
                <span>
                  {coupon.discountType === "PERCENT" ? `${coupon.discountValue}%` : inr(coupon.discountValue)}
                  {coupon.maxDiscount ? ` (max ${inr(coupon.maxDiscount)})` : ""}
                </span>
                <span>{coupon.minOrderValue > 0 ? inr(coupon.minOrderValue) : "—"}</span>
                <span>{coupon.usageLimit > 0 ? `${coupon.usedCount}/${coupon.usageLimit}` : `${coupon.usedCount} used`}</span>
                <span className={`status ${coupon.isActive ? "delivered" : "cancelled"}`}>{coupon.isActive ? "Active" : "Paused"}</span>
                <span className="row-actions">
                  <button className="action" onClick={() => void toggleCoupon(coupon)}>
                    {coupon.isActive ? "Pause" : "Activate"}
                  </button>
                  <button className="action reject" onClick={() => void deleteCoupon(coupon)}>
                    Delete
                  </button>
                </span>
              </div>
            ))}
            {coupons.length === 0 && <p className="muted">No coupons yet — create one above.</p>}
          </div>
        </section>
      )}
    </>
  );
}
