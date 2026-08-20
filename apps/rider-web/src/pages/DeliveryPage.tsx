import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { connectSocket, disconnectSocket } from "../lib/socket";
import type { ActiveDelivery } from "../lib/types";
import { ArrowLeft, Phone, MapPin, CheckCircle2 } from "lucide-react";

export function DeliveryPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["active-delivery"],
    queryFn: () => api.get<ActiveDelivery>("/riders/delivery/active"),
    refetchInterval: 3_000,
  });
  const order = data?.order;

  // Redirect if no active order or it's a different one
  useEffect(() => {
    if (!isLoading && (!order || order.id !== orderId)) navigate("/");
  }, [order, orderId, isLoading, navigate]);

  // Socket updates
  useEffect(() => {
    const socket = connectSocket();
    socket.on("order:updated", () => queryClient.invalidateQueries({ queryKey: ["active-delivery"] }));
    return () => { disconnectSocket(); };
  }, [queryClient]);

  // Delivery actions
  const acceptMutation = useMutation({
    mutationFn: () => api.post<{ order: any }>(`/riders/delivery/${orderId}/accept`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["active-delivery"] }),
  });
  const pickupMutation = useMutation({
    mutationFn: () => api.post<{ order: any; deliveryOtp: string }>(`/riders/delivery/${orderId}/pickup`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["active-delivery"] }),
  });
  const startDeliveryMutation = useMutation({
    mutationFn: () => api.post<{ order: any }>(`/riders/delivery/${orderId}/start-delivery`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["active-delivery"] }),
  });

  // OTP delivery
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const deliverMutation = useMutation({
    mutationFn: () => api.post<{ order: any }>(`/riders/delivery/${orderId}/deliver`, { otp }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["active-delivery"] }); navigate("/"); },
    onError: (e: any) => setOtpError(e.message || "Invalid OTP"),
  });

  if (isLoading || !order) return <div className="page-status">Loading delivery…</div>;

  const status = order.status;
  const deliveryOtp = (order as any).deliveryOtp;

  const steps = [
    { label: "Accepted", done: ["RIDER_ACCEPTED", "PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED"].includes(status) },
    { label: "Picked Up", done: ["PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED"].includes(status) },
    { label: "On the Way", done: ["OUT_FOR_DELIVERY", "DELIVERED"].includes(status) },
    { label: "Delivered", done: status === "DELIVERED" },
  ];

  return (
    <div className="delivery-page">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => navigate("/")} style={{ padding: 8, border: "none", background: "none", cursor: "pointer" }}>
          <ArrowLeft size={20} color="var(--ink)" />
        </button>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 900, letterSpacing: -.6 }}>{order.orderNumber}</h1>
          <span className="badge badge-green">{status.replace(/_/g, " ")}</span>
        </div>
      </div>

      {/* Progress */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="progress-bar">
          {steps.map((s, i) => (
            <div key={s.label} className={`progress-step ${s.done ? "active" : ""}`}>
              <div className={`step-circle ${s.done ? "active" : "inactive"}`}>{i + 1}</div>
              <span className="step-label">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Restaurant */}
      <div className="card delivery-section">
        <p className="section-eyebrow">PICKUP FROM</p>
        <p className="section-title">{order.restaurantName}</p>
        {order.restaurantPhone && (
          <a href={`tel:${order.restaurantPhone}`} className="action-link">
            <Phone size={14} /> {order.restaurantPhone}
          </a>
        )}
      </div>

      {/* Delivery address */}
      <div className="card delivery-section">
        <p className="section-eyebrow">DELIVER TO</p>
        <p className="section-title">{order.deliveryAddress.formattedAddress}</p>
        {order.deliveryAddress.latitude && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${order.deliveryAddress.latitude},${order.deliveryAddress.longitude}`}
            target="_blank" rel="noopener noreferrer"
            className="action-link"
          >
            <MapPin size={14} /> Open in Maps
          </a>
        )}
      </div>

      {/* Items */}
      <div className="card delivery-section">
        <p className="section-eyebrow">ORDER ITEMS</p>
        {order.items.map((item, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
            <span>{item.quantity}× {item.name}</span>
            <span style={{ color: "var(--muted)" }}>₹{item.price * item.quantity}</span>
          </div>
        ))}
        <div style={{ borderTop: "1px solid var(--gray-200)", marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between", fontWeight: 900 }}>
          <span>Total</span><span>₹{order.total}</span>
        </div>
      </div>

      {/* Delivery OTP display */}
      {status === "PICKED_UP" && deliveryOtp && (
        <div className="otp-display">
          <p className="otp-label">DELIVERY OTP</p>
          <p className="otp-value">{deliveryOtp}</p>
          <p className="otp-hint">Share this with the customer</p>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {status === "RIDER_ASSIGNED" && (
          <button className="btn btn-primary btn-block" onClick={() => acceptMutation.mutate()} disabled={acceptMutation.isPending}>
            Accept Delivery
          </button>
        )}
        {status === "RIDER_ACCEPTED" && (
          <button className="btn btn-primary btn-block" onClick={() => pickupMutation.mutate()} disabled={pickupMutation.isPending}>
            Mark Picked Up
          </button>
        )}
        {status === "PICKED_UP" && (
          <button className="btn btn-primary btn-block" onClick={() => startDeliveryMutation.mutate()} disabled={startDeliveryMutation.isPending}>
            Start Delivery
          </button>
        )}
        {status === "OUT_FOR_DELIVERY" && (
          <>
            <div className="field">
              <label className="label">Enter customer's OTP to confirm delivery</label>
              <input className="input" type="text" inputMode="numeric" maxLength={6} placeholder="6-digit OTP" value={otp} onChange={(e) => { setOtp(e.target.value); setOtpError(""); }} />
            </div>
            {otpError && <p className="error-text">{otpError}</p>}
            <button className="btn btn-primary btn-block" onClick={() => deliverMutation.mutate()} disabled={deliverMutation.isPending || otp.length !== 6}>
              {deliverMutation.isPending ? "Verifying…" : "Confirm Delivery"}
            </button>
          </>
        )}
        {status === "DELIVERED" && (
          <div className="card" style={{ textAlign: "center", background: "#dcfce7" }}>
            <CheckCircle2 size={36} color="var(--green-500)" style={{ margin: "0 auto 8px" }} />
            <p style={{ fontWeight: 900, fontSize: 16 }}>Delivery Complete! 🎉</p>
          </div>
        )}
      </div>
    </div>
  );
}
