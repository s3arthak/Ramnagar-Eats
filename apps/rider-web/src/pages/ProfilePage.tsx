import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import type { User } from "../lib/types";

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

  if (isLoading) return <div className="page-status">Loading…</div>;
  if (!rider) return <div className="page-status">Profile not found</div>;

  return (
    <div>
      <h1 className="page-title">Profile</h1>

      {!editing ? (
        <>
          <div className="profile-card">
            <div className="info-row">
              <span className="info-label">Name</span>
              <span className="info-value">{rider.name}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Email</span>
              <span className="info-value">{rider.email ?? "—"}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Phone</span>
              <span className="info-value">{rider.phone ?? "—"}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Vehicle</span>
              <span className="info-value">{rider.vehicleType ?? "—"} · {rider.vehicleNumber ?? "—"}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Delivery Area</span>
              <span className="info-value">{rider.deliveryArea ?? "—"}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Status</span>
              <span className="info-value">
                <span className={`status-dot ${rider.riderStatus === "ONLINE" ? "online" : rider.riderStatus === "BUSY" ? "busy" : "offline"}`} />
                {rider.riderStatus}
              </span>
            </div>
            <div className="info-row">
              <span className="info-label">Approval</span>
              <span className="info-value">{rider.riderApproval}</span>
            </div>
          </div>

          <div className="stats-grid">
            <div className="card stat-card">
              <p className="stat-value">{rider.todayDeliveries}</p>
              <p className="stat-label">Today's Deliveries</p>
            </div>
            <div className="card stat-card">
              <p className="stat-value">₹{rider.todayEarnings}</p>
              <p className="stat-label">Today's Earnings</p>
            </div>
          </div>

          <button className="btn btn-outline btn-block" onClick={startEdit}>Edit Profile</button>
          <button className="btn btn-outline btn-block" style={{ marginTop: 8, color: "var(--red-500)" }} onClick={() => void logout().then(() => navigate("/login"))}>Sign Out</button>
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
