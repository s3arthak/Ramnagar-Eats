import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { connectSocket, disconnectSocket } from "../lib/socket";
import type { ActiveDelivery, User } from "../lib/types";
import { Clock, LogOut, Navigation, Package, Truck, Wallet } from "lucide-react";

export function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [locationError, setLocationError] = useState("");

  // Redirect to setup if profile incomplete
  useEffect(() => {
    if (user && !user.vehicleType) navigate("/setup");
  }, [user, navigate]);

  // Fetch rider profile
  const { data: profileData } = useQuery({
    queryKey: ["rider-me"],
    queryFn: () => api.get<{ user: User }>("/riders/me"),
    refetchInterval: 10_000,
  });
  const rider = profileData?.user ?? user;

  // Fetch active delivery
  const { data: activeData } = useQuery({
    queryKey: ["active-delivery"],
    queryFn: () => api.get<ActiveDelivery>("/riders/delivery/active"),
    refetchInterval: 5_000,
  });
  const activeOrder = activeData?.order;

  // Online/offline toggle
  const statusMutation = useMutation({
    mutationFn: (status: "ONLINE" | "OFFLINE") =>
      api.post<{ riderStatus: string }>("/riders/status", { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rider-me"] }),
  });

  // Location tracking
  useEffect(() => {
    if (rider?.riderStatus !== "ONLINE" && rider?.riderStatus !== "BUSY") return;
    const watchId = navigator.geolocation?.watchPosition(
      (pos) => {
        api.post("/riders/location", {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading ?? undefined,
          speed: pos.coords.speed ?? undefined,
        }).catch(() => {});
      },
      () => setLocationError("Location access denied"),
      { enableHighAccuracy: true, maximumAge: 10_000 },
    );
    return () => { if (watchId !== undefined) navigator.geolocation?.clearWatch(watchId); };
  }, [rider?.riderStatus]);

  // Socket for real-time updates
  useEffect(() => {
    if (!rider) return;
    const socket = connectSocket();
    socket.on("order:assigned", () => queryClient.invalidateQueries({ queryKey: ["active-delivery"] }));
    socket.on("order:updated", () => {
      queryClient.invalidateQueries({ queryKey: ["active-delivery"] });
      queryClient.invalidateQueries({ queryKey: ["rider-me"] });
    });
    return () => { disconnectSocket(); };
  }, [rider, queryClient]);

  const isOnline = rider?.riderStatus === "ONLINE" || rider?.riderStatus === "BUSY";
  const isPending = rider?.riderApproval === "PENDING";
  const isRejected = rider?.riderApproval === "REJECTED";

  return (
    <div className="page" style={{ paddingTop: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>🚴 {rider?.name ?? "Rider"}</h1>
          <p style={{ fontSize: 12, color: "var(--gray-400)" }}>{rider?.vehicleType} · {rider?.deliveryArea}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link to="/history" className="btn btn-outline" style={{ padding: "8px 12px", fontSize: 13 }}><Clock size={14} /></Link>
          <Link to="/profile" className="btn btn-outline" style={{ padding: "8px 12px", fontSize: 13 }}>Profile</Link>
          <button className="btn btn-outline" style={{ padding: "8px 12px" }} onClick={async () => { await logout(); navigate("/login"); }}>
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {/* Approval pending */}
      {isPending && (
        <div className="card" style={{ background: "#fef3c7", border: "1px solid #fde68a", marginBottom: 16 }}>
          <p style={{ fontWeight: 600, color: "#92400e" }}>⏳ Account Pending Approval</p>
          <p style={{ fontSize: 13, color: "#a16207", marginTop: 4 }}>An admin will review your account shortly.</p>
        </div>
      )}
      {isRejected && (
        <div className="card" style={{ background: "#fee2e2", border: "1px solid #fecaca", marginBottom: 16 }}>
          <p style={{ fontWeight: 600, color: "#991b1b" }}>❌ Account Rejected</p>
          <p style={{ fontSize: 13, color: "#b91c1c", marginTop: 4 }}>Contact support for more information.</p>
        </div>
      )}

      {/* Online/Offline toggle */}
      {rider?.riderApproval === "APPROVED" && !activeOrder && (
        <div className="card" style={{ marginBottom: 16, textAlign: "center" }}>
          <p style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 8 }}>
            You are {isOnline ? "🟢 Online" : "🔴 Offline"}
          </p>
          <button
            className={`btn ${isOnline ? "btn-outline" : "btn-primary"}`}
            style={{ width: "100%" }}
            onClick={() => statusMutation.mutate(isOnline ? "OFFLINE" : "ONLINE")}
            disabled={statusMutation.isPending}
          >
            {isOnline ? "Go Offline" : "Go Online"}
          </button>
        </div>
      )}

      {locationError && (
        <p style={{ fontSize: 12, color: "var(--red-500)", marginBottom: 8, textAlign: "center" }}>{locationError}</p>
      )}

      {/* Active Delivery */}
      {activeOrder && (
        <Link to={`/delivery/${activeOrder.id}`} className="card" style={{ display: "block", marginBottom: 16, borderLeft: "4px solid var(--green-500)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p style={{ fontSize: 12, color: "var(--gray-400)" }}>ACTIVE DELIVERY</p>
              <p style={{ fontWeight: 700, fontSize: 16 }}>{activeOrder.orderNumber}</p>
              <p style={{ fontSize: 13, color: "var(--gray-500)" }}>{activeOrder.restaurantName} · {activeOrder.items.length} item(s)</p>
            </div>
            <Truck size={24} color="var(--green-500)" />
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span className="badge badge-green">{activeOrder.status.replace(/_/g, " ")}</span>
            <span className="badge badge-gray">₹{activeOrder.total}</span>
          </div>
        </Link>
      )}

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div className="card" style={{ textAlign: "center" }}>
          <Package size={20} color="var(--green-500)" style={{ margin: "0 auto 4px" }} />
          <p style={{ fontSize: 24, fontWeight: 700 }}>{rider?.todayDeliveries ?? 0}</p>
          <p style={{ fontSize: 12, color: "var(--gray-400)" }}>Today's Deliveries</p>
        </div>
        <div className="card" style={{ textAlign: "center" }}>
          <Wallet size={20} color="var(--green-500)" style={{ margin: "0 auto 4px" }} />
          <p style={{ fontSize: 24, fontWeight: 700 }}>₹{rider?.todayEarnings ?? 0}</p>
          <p style={{ fontSize: 12, color: "var(--gray-400)" }}>Today's Earnings</p>
        </div>
      </div>

      {/* No active delivery */}
      {!activeOrder && rider?.riderApproval === "APPROVED" && (
        <div className="card" style={{ textAlign: "center", padding: 32 }}>
          <Navigation size={32} color="var(--gray-300)" style={{ margin: "0 auto 8px" }} />
          <p style={{ color: "var(--gray-400)", fontSize: 14 }}>
            {isOnline ? "Waiting for a delivery…" : "Go online to start receiving deliveries"}
          </p>
        </div>
      )}
    </div>
  );
}
