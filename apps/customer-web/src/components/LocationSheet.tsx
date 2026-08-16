import { useState } from "react";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import { LocateFixed, X } from "lucide-react";
import "leaflet/dist/leaflet.css";
import { useLocation, type Serviceability } from "../context/LocationContext";
import { distanceKm } from "../lib/format";

const DEFAULT_POSITION: [number, number] = [19.076, 72.8777];

export function LocationSheet({ onClose }: { onClose: () => void }) {
  const { place, setPlace, checkServiceability } = useLocation();
  const [position, setPosition] = useState<[number, number]>([place?.lat ?? DEFAULT_POSITION[0], place?.lng ?? DEFAULT_POSITION[1]]);
  const [pincode, setPincode] = useState(place?.pincode ?? "");
  const [label, setLabel] = useState(place?.label ?? "Home");
  const [status, setStatus] = useState<Serviceability | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported in this browser. Enter your pincode instead.");
      return;
    }
    setError("");
    navigator.geolocation.getCurrentPosition(
      (value) => setPosition([value.coords.latitude, value.coords.longitude]),
      () => setError("Could not access your location. Enter your pincode instead."),
    );
  }

  async function confirm() {
    if (!pincode.trim() || !label.trim()) return;
    setError("");
    setChecking(true);
    try {
      const result = await checkServiceability(position[0], position[1]);
      if (!result.serviceable) {
        setStatus(result);
        return;
      }
      setPlace({ lat: position[0], lng: position[1], label: label.trim(), pincode: pincode.trim() });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not verify this location");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Set delivery location">
      <section className="location-sheet">
        <button className="close" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
        <p className="eyebrow">YOUR DELIVERY AREA</p>
        <h2>Where should we bring your food?</h2>
        <p className="sheet-copy">Use your precise location so we show restaurants that can actually deliver to you.</p>
        <button className="gps" onClick={useCurrentLocation}>
          <LocateFixed size={18} /> Use my current location
        </button>
        <div className="map">
          <MapContainer center={position} zoom={14} scrollWheelZoom={false}>
            <TileLayer attribution="© OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <DraggableMarker position={position} onMove={setPosition} />
          </MapContainer>
        </div>
        <div className="location-fields">
          <label>
            Location name
            <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Home" />
          </label>
          <label>
            Pincode
            <input value={pincode} onChange={(event) => setPincode(event.target.value)} placeholder="400001" inputMode="numeric" />
          </label>
        </div>
        {status && !status.serviceable && (
          <p className="notice notice--error" role="alert">
            Sorry, we don't deliver here yet. You're {distanceKm(status.distanceKm)} from our delivery area (max {status.radiusKm} km).
          </p>
        )}
        {error && (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        )}
        <button className="confirm" disabled={!pincode.trim() || !label.trim() || checking} onClick={() => void confirm()}>
          {checking ? "Checking…" : "Confirm delivery location"}
        </button>
      </section>
    </div>
  );
}

function DraggableMarker({ position, onMove }: { position: [number, number]; onMove: (value: [number, number]) => void }) {
  const map = useMapEvents({
    click(event) {
      onMove([event.latlng.lat, event.latlng.lng]);
      map.panTo(event.latlng);
    },
  });
  return <Marker position={position} draggable eventHandlers={{ dragend(event) { const point = event.target.getLatLng(); onMove([point.lat, point.lng]); } }} />;
}
