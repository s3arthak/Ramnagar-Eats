import { useCallback, useEffect, useState } from "react";
import { LocateFixed, MapPin, Pencil, Plus, Trash2, X } from "lucide-react";
import { api } from "../lib/api";
import type { Address } from "../lib/types";
import { useToast } from "../context/ToastContext";
import { EmptyState, ErrorState } from "../components/ui/StateViews";
import { Spinner } from "../components/ui/Skeleton";

type AddressFormValues = {
  id?: string;
  label: Address["label"];
  formattedAddress: string;
  pincode: string;
  city: string;
  state: string;
  locality: string;
  isDefault: boolean;
};

const EMPTY_FORM: AddressFormValues = { label: "Home", formattedAddress: "", pincode: "", city: "", state: "", locality: "", isDefault: false };

function toFormValues(address: Address): AddressFormValues {
  return { ...address, city: address.city ?? "", state: address.state ?? "", locality: address.locality ?? "" };
}

export function AddressesPage() {
  const { push } = useToast();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Address | "new" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.get<{ addresses: Address[] }>("/users/addresses");
      setAddresses(data.addresses);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load your addresses");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(address: Address) {
    if (!window.confirm(`Delete the ${address.label} address?`)) return;
    try {
      await api.delete(`/users/addresses/${address.id}`);
      push("Address deleted", { body: address.label, tone: "info" });
    } catch (caught) {
      push("Could not delete address", { body: caught instanceof Error ? caught.message : undefined, tone: "danger" });
    }
    await load();
  }

  async function setDefault(address: Address) {
    try {
      await api.patch(`/users/addresses/${address.id}`, { isDefault: true });
      push("Default address updated", { body: address.formattedAddress, tone: "success" });
    } catch (caught) {
      push("Could not update address", { body: caught instanceof Error ? caught.message : undefined, tone: "danger" });
    }
    await load();
  }

  return (
    <div className="content page">
      <h1 className="page-title">My addresses</h1>
      <div className="addresses-head">
        <p className="listing-sub">Saved delivery locations for faster checkout.</p>
        <button className="filter" onClick={() => setEditing("new")}>
          <Plus size={14} /> Add address
        </button>
      </div>

      {loading ? (
        <Spinner label="Loading addresses…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : addresses.length === 0 ? (
        <EmptyState
          icon={<MapPin size={30} />}
          title="No saved addresses"
          copy="Add a delivery address so you can check out in one tap."
          action={
            <button className="filter" onClick={() => setEditing("new")}>
              Add your first address
            </button>
          }
        />
      ) : (
        <ul className="address-list">
          {addresses.map((address) => (
            <li key={address.id} className={`address-card ${address.isDefault ? "is-default" : ""}`}>
              <div className="address-card-main">
                <span className="address-label">{address.label}</span>
                {address.isDefault && <span className="badge badge--open">Default</span>}
                <p>{address.formattedAddress}</p>
                <small>
                  {address.pincode}
                </small>
              </div>
              <div className="address-actions">
                {!address.isDefault && (
                  <button onClick={() => void setDefault(address)}>Set as default</button>
                )}
                <button onClick={() => setEditing(address)} aria-label={`Edit ${address.label} address`}>
                  <Pencil size={14} /> Edit
                </button>
                <button className="danger" onClick={() => void remove(address)} aria-label={`Delete ${address.label} address`}>
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <AddressForm
          initial={editing === "new" ? { ...EMPTY_FORM } : toFormValues(editing)}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function AddressForm({ initial, onClose, onSaved }: { initial: AddressFormValues; onClose: () => void; onSaved: () => Promise<void> }) {
  const { push } = useToast();
  const [form, setForm] = useState<AddressFormValues & { latitude?: number; longitude?: number }>(initial as AddressFormValues & { latitude?: number; longitude?: number });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function useCurrent() {
    navigator.geolocation?.getCurrentPosition((value) =>
      setForm((current) => ({ ...current, latitude: value.coords.latitude, longitude: value.coords.longitude })),
    );
  }

  async function save() {
    setError("");
    setSaving(true);
    try {
      const body = { ...form };
      if (form.latitude !== undefined) body.latitude = form.latitude;
      if (form.longitude !== undefined) body.longitude = form.longitude;
      if (form.id) {
        const { id: _id, ...rest } = body;
        await api.patch(`/users/addresses/${_id}`, rest);
        push("Address updated", { tone: "success" });
      } else {
        await api.post("/users/addresses", body);
        push("Address saved", { tone: "success" });
      }
      await onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save address");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Address form">
      <section className="location-sheet">
        <button className="close" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
        <p className="eyebrow">DELIVERY ADDRESS</p>
        <h2>{initial.id ? "Edit address" : "Add a new address"}</h2>
        <div className="location-fields">
          <label>
            Label
            <select value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value as Address["label"] })}>
              <option>Home</option>
              <option>Work</option>
              <option>Other</option>
            </select>
          </label>
          <label>
            Pincode
            <input value={form.pincode} onChange={(event) => setForm({ ...form, pincode: event.target.value })} placeholder="182122" inputMode="numeric" />
          </label>
          <label className="wide">
            Full address
            <input value={form.formattedAddress} onChange={(event) => setForm({ ...form, formattedAddress: event.target.value })} placeholder="Flat, building, street, area" />
          </label>
          <label>
            City
            <input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} placeholder="Jammu" />
          </label>
          <label>
            State
            <input value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} placeholder="Maharashtra" />
          </label>
          <label>
            Locality / area
            <input value={form.locality} onChange={(event) => setForm({ ...form, locality: event.target.value })} placeholder="Ramnagar" />
          </label>

        </div>
        <button className="gps" onClick={useCurrent}>
          <LocateFixed size={18} /> Use my current location
        </button>
        <label className="address-default-toggle">
          <input type="checkbox" checked={form.isDefault} onChange={(event) => setForm({ ...form, isDefault: event.target.checked })} />
          Set as my default delivery address
        </label>
        {error && (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        )}
        <button className="confirm" disabled={!form.formattedAddress.trim() || !form.pincode.trim() || saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save address"}
        </button>
        <p className="address-note">Address will be saved without coordinates. For better accuracy, use "Use my current location".</p>
      </section>
    </div>
  );
}
