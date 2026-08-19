import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import type { User } from "../lib/types";

export function SetupPage() {
  const { user, setSession } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [vehicleType, setVehicleType] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [deliveryArea, setDeliveryArea] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError(""); setSaving(true);
    try {
      const data = await api.post<{ user: User; token: string }>("/riders/setup", {
        name, phone: phone || undefined, vehicleType, vehicleNumber, deliveryArea,
      });
      setSession(data.token, data.user);
      navigate("/");
    } catch (e: any) {
      setError(e.message || "Setup failed");
    } finally { setSaving(false); }
  };

  const valid = name.length >= 2 && vehicleType && vehicleNumber && deliveryArea;

  return (
    <div className="page" style={{ paddingTop: 32 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Complete Your Profile</h1>
      <p style={{ color: "var(--gray-500)", marginBottom: 24, fontSize: 14 }}>Tell us about your vehicle and delivery area</p>

      <div className="field">
        <label className="label">Full Name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label className="label">Phone</label>
        <input className="input" type="tel" placeholder="9876543210" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="field">
        <label className="label">Vehicle Type</label>
        <select className="input" value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}>
          <option value="">Select…</option>
          <option value="Bicycle">Bicycle</option>
          <option value="Motorcycle">Motorcycle</option>
          <option value="Scooter">Scooter</option>
          <option value="Car">Car</option>
        </select>
      </div>
      <div className="field">
        <label className="label">Vehicle Number</label>
        <input className="input" placeholder="JK01AB1234" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} />
      </div>
      <div className="field">
        <label className="label">Delivery Area</label>
        <input className="input" placeholder="e.g. Ramnagar" value={deliveryArea} onChange={(e) => setDeliveryArea(e.target.value)} />
      </div>

      {error && <p className="error-text">{error}</p>}

      <button className="btn btn-primary btn-block" onClick={submit} disabled={saving || !valid}>
        {saving ? "Saving…" : "Complete Setup"}
      </button>
    </div>
  );
}
