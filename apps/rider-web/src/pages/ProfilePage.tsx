import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import type { User } from "../lib/types";
import { ArrowLeft } from "lucide-react";

export function ProfilePage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["rider-me"],
    queryFn: () => api.get<{ user: User }>("/riders/me"),
  });
  const rider = data?.user;

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [deliveryArea, setDeliveryArea] = useState("");
  const [error, setError] = useState("");

  const updateMutation = useMutation({
    mutationFn: () => api.patch<{ user: User }>("/riders/me", { name, vehicleType, vehicleNumber, deliveryArea }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["rider-me"] }); setEditing(false); },
    onError: (e: any) => setError(e.message),
  });

  const startEdit = () => {
    if (rider) {
      setName(rider.name);
      setVehicleType(rider.vehicleType ?? "");
      setVehicleNumber(rider.vehicleNumber ?? "");
      setDeliveryArea(rider.deliveryArea ?? "");
    }
    setEditing(true);
    setError("");
  };

  if (isLoading) return <div className="loading">Loading…</div>;
  if (!rider) return <div className="loading">Profile not found</div>;

  return (
    <div className="page" style={{ paddingTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate("/")} style={{ padding: 8 }}><ArrowLeft size={20} /></button>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Profile</h1>
      </div>

      {!editing ? (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <InfoRow label="Name" value={rider.name} />
            <InfoRow label="Email" value={rider.email ?? "—"} />
            <InfoRow label="Phone" value={rider.phone ?? "—"} />
            <InfoRow label="Vehicle" value={`${rider.vehicleType ?? "—"} · ${rider.vehicleNumber ?? "—"}`} />
            <InfoRow label="Delivery Area" value={rider.deliveryArea ?? "—"} />
            <InfoRow label="Status" value={rider.riderStatus} />
            <InfoRow label="Approval" value={rider.riderApproval} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div className="card" style={{ textAlign: "center" }}>
              <p style={{ fontSize: 24, fontWeight: 700 }}>{rider.todayDeliveries}</p>
              <p style={{ fontSize: 12, color: "var(--gray-400)" }}>Today's Deliveries</p>
            </div>
            <div className="card" style={{ textAlign: "center" }}>
              <p style={{ fontSize: 24, fontWeight: 700 }}>₹{rider.todayEarnings}</p>
              <p style={{ fontSize: 12, color: "var(--gray-400)" }}>Today's Earnings</p>
            </div>
          </div>

          <button className="btn btn-outline btn-block" onClick={startEdit}>Edit Profile</button>
          <button className="btn btn-outline btn-block" style={{ marginTop: 8, color: "var(--red-500)" }} onClick={async () => { await logout(); navigate("/login"); }}>Sign Out</button>
        </>
      ) : (
        <>
          <div className="field">
            <label className="label">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Vehicle Type</label>
            <input className="input" value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Vehicle Number</label>
            <input className="input" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Delivery Area</label>
            <input className="input" value={deliveryArea} onChange={(e) => setDeliveryArea(e.target.value)} />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary btn-block" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "Saving…" : "Save Changes"}
          </button>
          <button className="btn btn-outline btn-block" style={{ marginTop: 8 }} onClick={() => setEditing(false)}>Cancel</button>
        </>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--gray-100)" }}>
      <span style={{ fontSize: 13, color: "var(--gray-400)" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500 }}>{value}</span>
    </div>
  );
}
