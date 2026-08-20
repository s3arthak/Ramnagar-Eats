import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { connectSocket, disconnectSocket } from "../lib/socket";
import type { ActiveDelivery, User } from "../lib/types";
import { Navigation, Package, Truck, Wallet } from "lucide-react";

export function DashboardPage() {
  const { user } = useAuth();
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
    <div>
      {/* Approval pending */}
      {isPending && (
        <div className="banner banner-pending">
          <p className="banner-title">⏳ Account Pending Approval</p>
          <p className="banner-desc">An admin will review your account shortly.</p>
        </div>
      )}
      {isRejected && (
        <div className="banner banner-rejected">
          <p className="banner-title">❌ Account Rejected</p>
          <p className="banner-desc">Contact support for more information.</p>
        </div>
      )}

      {/* Online/Offline toggle */}
      {rider?.riderApproval === "APPROVED" && !activeOrder && (
        <div className="card status-card">
          <p className="status-indicator">
            <span className={`status-dot ${isOnline ? "online" : "offline"}`} />
            You are {isOnline ? "Online" : "Offline"}
          </p>
          <button
            className={`btn ${isOnline ? "btn-outline" : "btn-primary"} btn-block`}
            onClick={() => statusMutation.mutate(isOnline ? "OFFLINE" : "ONLINE")}
            disabled={statusMutation.isPending}
          >
            {isOnline ? "Go Offline" : "Go Online"}
          </button>
        </div>
      )}

      {locationError && (
        <p className="error-text" style={{ textAlign: "center", marginBottom: 8 }}>{locationError}</p>
      )}

      {/* Active Delivery */}
      {activeOrder && (
        <Link to={`/delivery/${activeOrder.id}`} className="card delivery-card">
          <div className="delivery-header">
            <div>
              <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1, color: "var(--muted)", marginBottom: 4 }}>ACTIVE DELIVERY</p>
              <p className="delivery-number">{activeOrder.orderNumber}</p>
              <p className="delivery-meta">{activeOrder.restaurantName} · {activeOrder.items.length} item(s)</p>
            </div>
            <Truck size={28} color="var(--green-500)" />
          </div>
          <div className="delivery-footer">
            <span className="badge badge-green">{activeOrder.status.replace(/_/g, " ")}</span>
            <span className="badge badge-gray">₹{activeOrder.total}</span>
          </div>
        </Link>
      )}

      {/* Stats */}
      <div className="stats-grid">
        <div className="card stat-card">
          <Package size={22} color="var(--green-500)" style={{ margin: "0 auto 6px" }} />
          <p className="stat-value">{rider?.todayDeliveries ?? 0}</p>
          <p className="stat-label">Today's Deliveries</p>
        </div>
        <div className="card stat-card">
          <Wallet size={22} color="var(--green-500)" style={{ margin: "0 auto 6px" }} />
          <p className="stat-value">₹{rider?.todayEarnings ?? 0}</p>
          <p className="stat-label">Today's Earnings</p>
        </div>
      </div>

      {/* No active delivery */}
      {!activeOrder && rider?.riderApproval === "APPROVED" && (
        <div className="empty-state">
          <Navigation size={36} className="empty-icon" />
          <p style={{ fontWeight: 700, fontSize: 14 }}>
            {isOnline ? "Waiting for a delivery…" : "Go online to start receiving deliveries"}
          </p>
        </div>
      )}
    </div>
  );
}
