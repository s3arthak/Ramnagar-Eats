import { useEffect, useState, type FormEvent } from "react";
import { api } from "../lib/api";
import type { RestaurantProfile } from "../lib/types";
import { ImageUploader } from "../components/ui/ImageUploader";

export function RestaurantPage({ restaurant, onChange }: { restaurant: RestaurantProfile | null; onChange: (restaurant: RestaurantProfile) => void }) {
  const [form, setForm] = useState<RestaurantProfile>(() =>
    restaurant ?? {
      id: "",
      name: "",
      description: "",
      phone: "",
      address: "",
      cuisines: [],
      isOpen: true,
      isAcceptingOrders: true,
      openingTime: "",
      closingTime: "",
      isPureVeg: false,
      priceForTwo: 300,
      minOrder: 99,
      deliveryTimeMin: 20,
      deliveryTimeMax: 35,
      offers: [],
      location: null,
    },
  );
  const [hydrated, setHydrated] = useState(restaurant !== null);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  // The profile is fetched async in App, so on a fresh page load this component
  // mounts with restaurant === null and the form initializes empty. Hydrate the
  // form once when the data arrives; never clobber in-progress edits after that.
  useEffect(() => {
    if (restaurant && !hydrated) {
      setForm(restaurant);
      setHydrated(true);
    }
  }, [restaurant, hydrated]);

  function update<K extends keyof RestaurantProfile>(key: K, value: RestaurantProfile[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    try {
      const data = await api.put<{ restaurant: RestaurantProfile }>("/restaurants/me", {
        name: form.name,
        description: form.description,
        phone: form.phone,
        address: form.address,
        cuisines: form.cuisines,
        logo: form.logo || undefined,
        coverImage: form.coverImage || undefined,
        isOpen: form.isOpen,
        isAcceptingOrders: form.isAcceptingOrders,
        openingTime: form.openingTime,
        closingTime: form.closingTime,
        isPureVeg: form.isPureVeg,
        priceForTwo: form.priceForTwo,
        minOrder: form.minOrder,
        deliveryTimeMin: form.deliveryTimeMin,
        deliveryTimeMax: form.deliveryTimeMax,
        location: form.location ?? undefined,
      });
      onChange(data.restaurant);
      setNotice("Restaurant details saved.");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Unable to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header>
        <div>
          <p className="eyebrow">RESTAURANT PROFILE</p>
          <h1>Restaurant</h1>
        </div>
      </header>
      {notice && <p className="notice">{notice}</p>}
      <form className="form-card" onSubmit={save}>
        <h2>Restaurant details</h2>
        <p>These details are shown to customers nearby.</p>
        <div className="form-grid">
          <div className="wide image-field">
            <span className="field-label">Cover photo</span>
            <ImageUploader
              value={form.coverImage ?? ""}
              onChange={(coverImage) => update("coverImage", coverImage || undefined)}
              folder="restaurants"
              label="Cover photo"
              aspect="wide"
              fallbackText="Add cover photo"
            />
          </div>
          <div className="wide image-field">
            <span className="field-label">Logo</span>
            <ImageUploader
              value={form.logo ?? ""}
              onChange={(logo) => update("logo", logo || undefined)}
              folder="restaurants"
              label="Logo"
              aspect="square"
              fallbackText="Add logo"
            />
          </div>
          <label>
            Restaurant name
            <input value={form.name} onChange={(event) => update("name", event.target.value)} />
          </label>
          <label>
            Restaurant phone
            <input value={form.phone} onChange={(event) => update("phone", event.target.value)} />
          </label>
          <label className="wide">
            Address
            <input value={form.address} onChange={(event) => update("address", event.target.value)} />
          </label>
          <label>
            Cuisines (comma separated)
            <input value={form.cuisines.join(", ")} onChange={(event) => update("cuisines", event.target.value.split(",").map((value) => value.trim()).filter(Boolean))} />
          </label>
          <label>
            Price for two (₹)
            <input type="number" min={0} value={form.priceForTwo} onChange={(event) => update("priceForTwo", Number(event.target.value))} />
          </label>
          <label>
            Minimum order (₹)
            <input type="number" min={0} value={form.minOrder} onChange={(event) => update("minOrder", Number(event.target.value))} />
          </label>
          <label>
            Delivery time min (min)
            <input type="number" min={5} value={form.deliveryTimeMin} onChange={(event) => update("deliveryTimeMin", Number(event.target.value))} />
          </label>
          <label>
            Delivery time max (min)
            <input type="number" min={5} value={form.deliveryTimeMax} onChange={(event) => update("deliveryTimeMax", Number(event.target.value))} />
          </label>
          <label>
            Latitude
            <input type="number" step="0.0001" value={form.location?.lat ?? ""} onChange={(event) => update("location", { lat: Number(event.target.value), lng: form.location?.lng ?? 0 })} />
          </label>
          <label>
            Longitude
            <input type="number" step="0.0001" value={form.location?.lng ?? ""} onChange={(event) => update("location", { lat: form.location?.lat ?? 0, lng: Number(event.target.value) })} />
          </label>
          <label>
            Opening time (24h, optional)
            <input type="time" value={form.openingTime} onChange={(event) => update("openingTime", event.target.value)} />
          </label>
          <label>
            Closing time (24h, optional)
            <input type="time" value={form.closingTime} onChange={(event) => update("closingTime", event.target.value)} />
          </label>
          <p className="field-hint">Leave both empty for 24/7. Outside these hours the restaurant shows as closed and stops taking orders automatically.</p>
          <label className="wide">
            Description
            <textarea value={form.description} onChange={(event) => update("description", event.target.value)} />
          </label>
          <label className="check-row">
            <input type="checkbox" checked={form.isPureVeg} onChange={(event) => update("isPureVeg", event.target.checked)} /> Pure vegetarian restaurant
          </label>
          <label className="check-row">
            <input type="checkbox" checked={form.isAcceptingOrders} onChange={(event) => update("isAcceptingOrders", event.target.checked)} /> Accepting orders right now
          </label>
        </div>
        <button className="submit compact" disabled={saving || !form.name.trim()}>
          {saving ? "Saving…" : "Save restaurant"}
        </button>
      </form>
    </>
  );
}
