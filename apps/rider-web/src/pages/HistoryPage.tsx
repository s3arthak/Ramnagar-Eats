import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { ArrowLeft, CheckCircle2, IndianRupee, Package } from "lucide-react";

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
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["delivery-history"],
    queryFn: () => api.get<{ deliveries: Delivery[] }>("/riders/deliveries"),
  });
  const deliveries = data?.deliveries ?? [];
  const totalEarnings = deliveries.reduce((sum, d) => sum + d.deliveryFee, 0);

  return (
    <div className="page" style={{ paddingTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <button onClick={() => navigate("/")} style={{ padding: 8 }}><ArrowLeft size={20} /></button>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Delivery History</h1>
      </div>

      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div className="card" style={{ textAlign: "center" }}>
          <Package size={20} color="var(--green-500)" style={{ margin: "0 auto 4px" }} />
          <p style={{ fontSize: 24, fontWeight: 700 }}>{deliveries.length}</p>
          <p style={{ fontSize: 12, color: "var(--gray-400)" }}>Total Deliveries</p>
        </div>
        <div className="card" style={{ textAlign: "center" }}>
          <IndianRupee size={20} color="var(--green-500)" style={{ margin: "0 auto 4px" }} />
          <p style={{ fontSize: 24, fontWeight: 700 }}>₹{totalEarnings}</p>
          <p style={{ fontSize: 12, color: "var(--gray-400)" }}>Total Earned</p>
        </div>
      </div>

      {isLoading && <div className="loading">Loading…</div>}

      {!isLoading && deliveries.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 32 }}>
          <Package size={32} color="var(--gray-300)" style={{ margin: "0 auto 8px" }} />
          <p style={{ color: "var(--gray-400)" }}>No deliveries yet</p>
        </div>
      )}

      {deliveries.map((d) => (
        <div key={d.id} className="card" style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ fontWeight: 600 }}>{d.orderNumber}</p>
            <p style={{ fontSize: 13, color: "var(--gray-500)" }}>{d.restaurantName} · {d.itemCount} item(s)</p>
            <p style={{ fontSize: 12, color: "var(--gray-400)" }}>{new Date(d.deliveredAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontWeight: 700, color: "var(--green-600)" }}>+₹{d.deliveryFee}</p>
            <CheckCircle2 size={16} color="var(--green-500)" />
          </div>
        </div>
      ))}
    </div>
  );
}
