import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { CheckCircle2, Package } from "lucide-react";

interface Delivery {
  id: string;
  orderNumber: string;
  restaurantName: string;
  itemCount: number;
  total: number;
  deliveryFee: number;
  deliveredAt: string;
}

export function HistoryPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["delivery-history"],
    queryFn: () => api.get<{ deliveries: Delivery[] }>("/riders/deliveries"),
  });
  const deliveries = data?.deliveries ?? [];
  const totalEarnings = deliveries.reduce((sum, d) => sum + d.deliveryFee, 0);

  return (
    <div>
      <h1 className="page-title">Delivery History</h1>

      {/* Summary */}
      <div className="history-summary">
        <div className="card stat-card">
          <Package size={22} color="var(--green-500)" style={{ margin: "0 auto 6px" }} />
          <p className="stat-value">{deliveries.length}</p>
          <p className="stat-label">Total Deliveries</p>
        </div>
        <div className="card stat-card">
          <p className="stat-value">₹{totalEarnings}</p>
          <p className="stat-label">Total Earned</p>
        </div>
      </div>

      {isLoading && <div className="page-status">Loading…</div>}

      {!isLoading && deliveries.length === 0 && (
        <div className="empty-state">
          <Package size={36} className="empty-icon" />
          <p style={{ fontWeight: 700 }}>No deliveries yet</p>
        </div>
      )}

      {deliveries.map((d) => (
        <div key={d.id} className="card history-item">
          <div>
            <p className="history-item-name">{d.orderNumber}</p>
            <p className="history-item-meta">{d.restaurantName} · {d.itemCount} item(s)</p>
            <p className="history-item-date">{new Date(d.deliveredAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
          </div>
          <div className="history-item-earning">
            <p className="history-item-amount">+₹{d.deliveryFee}</p>
            <CheckCircle2 size={16} color="var(--green-500)" />
          </div>
        </div>
      ))}
    </div>
  );
}
